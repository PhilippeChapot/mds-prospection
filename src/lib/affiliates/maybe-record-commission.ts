/**
 * maybeRecordAffiliateCommission — P5.x.7
 *
 * Helper appele depuis les webhook handlers (Stripe checkout.session.completed
 * + Sellsy docslog.paymentadd) juste apres set de `acompte_paid_at`.
 *
 * Idempotence : si le prospect a deja une `commission_eur_ht` non nulle,
 * on skip (premier paiement gagnant pour le calcul). Permet d'absorber
 * un paiement Stripe + un paymentadd Sellsy back-to-back sans
 * double-comptabiliser.
 *
 * Calcul :
 *   - Lookup prospect (sellsy_devis_total_ttc, affiliate_id, company.vat_*)
 *   - Lookup affiliate (commission_percent)
 *   - Determine isAutoliquidation via isAutoliquidationApplicable(country, verified)
 *   - calculateCommission(...)
 *   - UPDATE prospects { commission_eur_ht, commission_status='due' }
 *
 * Best-effort : ne throw jamais, log seulement. Le webhook continue
 * meme si la commission ne peut pas etre calculee (ex: devis sans
 * total_ttc, prospect sans company, etc.).
 *
 * Logs structures (prefix [affiliates/commission]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { calculateCommission } from './calc-commission';
import { isCommissionEligibleForCompany, type CompanyCategory } from './eligibility';
import { isAutoliquidationApplicable } from '@/lib/vies/verify';

const LOG_PREFIX = '[affiliates/commission]';

export async function maybeRecordAffiliateCommission(prospectId: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();

    const { data: prospect, error } = await supabase
      .from('prospects')
      .select(
        `
        id, affiliate_id, sellsy_devis_total_ttc, commission_eur_ht,
        company:companies!inner(name, category, vat_country, vat_verified)
        `,
      )
      .eq('id', prospectId)
      .maybeSingle();

    if (error || !prospect) {
      console.warn('%s prospect-not-found prospect=%s', LOG_PREFIX, prospectId);
      return;
    }

    if (!prospect.affiliate_id) {
      // Pas d'affilie attache -> pas de commission a calculer.
      return;
    }

    if (prospect.commission_eur_ht != null && Number(prospect.commission_eur_ht) > 0) {
      // Idempotence : deja calcule, skip.
      console.log(
        '%s already-calculated prospect=%s commission_eur_ht=%s',
        LOG_PREFIX,
        prospectId,
        prospect.commission_eur_ht,
      );
      return;
    }

    const ttc =
      prospect.sellsy_devis_total_ttc != null ? Number(prospect.sellsy_devis_total_ttc) : 0;
    if (ttc <= 0) {
      console.warn(
        '%s skip-no-total-ttc prospect=%s — devis_total_ttc null/0',
        LOG_PREFIX,
        prospectId,
      );
      return;
    }

    const company = pickFirst(prospect.company);

    // P7.x.1.D — Exclusion commission pour les PRS exhibitors (ils ont
    // leur propre programme tarifaire, hors perimetre MDS commission).
    // Le prospect reste track comme conversion attribuee (affiliate_id
    // conserve), mais on UPDATE commission_eur_ht=0 + status='not_applicable'
    // avec une note explicative pour la tracabilite admin.
    if (
      !isCommissionEligibleForCompany({ category: (company?.category as CompanyCategory) ?? null })
    ) {
      // On NE touche PAS prospects.notes (peut contenir des notes commerciales
      // legitimes). La trace de l'exclusion vit dans les logs structures +
      // dans la valeur commission_status='not_applicable' (lisible cote
      // admin dans la fiche prospect).
      const { error: skipErr } = await supabase
        .from('prospects')
        .update({
          commission_eur_ht: 0,
          commission_status: 'not_applicable',
        })
        .eq('id', prospectId);
      if (skipErr) {
        console.warn(
          '%s exclusion-update-failed prospect=%s msg=%s',
          LOG_PREFIX,
          prospectId,
          skipErr.message,
        );
      } else {
        console.log(
          '%s excluded prospect=%s category=%s reason=prs_exhibitor',
          LOG_PREFIX,
          prospectId,
          company?.category,
        );
      }
      // Pas d'email a l'affilie : ce n'est pas une commission gagnee.
      // L'affilie verra la conversion dans son tableau Paiements avec
      // status='not_applicable'.
      return;
    }

    const isAutoliquidation = isAutoliquidationApplicable(
      company?.vat_country ?? null,
      company?.vat_verified ?? null,
    );

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, commission_percent, display_name, contact_email')
      .eq('id', prospect.affiliate_id)
      .maybeSingle();

    if (!affiliate) {
      console.warn(
        '%s affiliate-not-found prospect=%s affiliate_id=%s',
        LOG_PREFIX,
        prospectId,
        prospect.affiliate_id,
      );
      return;
    }

    const { commissionEurHt, baseHt } = calculateCommission({
      totalSellsyAmount: ttc,
      isAutoliquidation,
      commissionPercent: Number(affiliate.commission_percent ?? 0),
    });

    if (commissionEurHt <= 0) {
      console.warn(
        '%s skip-zero-commission prospect=%s ttc=%d rate=%s autoliq=%s',
        LOG_PREFIX,
        prospectId,
        ttc,
        affiliate.commission_percent,
        isAutoliquidation,
      );
      return;
    }

    const { error: updateErr } = await supabase
      .from('prospects')
      .update({
        commission_eur_ht: commissionEurHt,
        commission_status: 'due',
      })
      .eq('id', prospectId);

    if (updateErr) {
      console.error(
        '%s update-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospectId,
        updateErr.message,
      );
      return;
    }

    console.log(
      '%s calculated prospect=%s affiliate=%s base_ht=%d commission_eur_ht=%d autoliq=%s',
      LOG_PREFIX,
      prospectId,
      affiliate.display_name,
      baseHt,
      commissionEurHt,
      isAutoliquidation,
    );

    // P7.x.1.C — notifier l'affilie que sa commission est validee
    // (status='due' dans notre schema = "validee, virement a venir").
    // Best-effort : si Resend est down ou contact_email vide, on log et
    // continue (la commission est deja persistee).
    if (affiliate.contact_email) {
      try {
        const { renderAffilieCommissionValidated } =
          await import('@/lib/resend/templates/affilie-commission-validated');
        const { sendTransactionalEmailViaResend } = await import('@/lib/resend/client');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
        const dashboardUrl = `${baseUrl}/fr/affilie`;
        const tpl = renderAffilieCommissionValidated({
          affilieName: affiliate.display_name,
          prospectCompany: company?.name ?? '—',
          amountEurHt: commissionEurHt,
          dashboardUrl,
        });
        await sendTransactionalEmailViaResend({
          to: affiliate.contact_email,
          toName: affiliate.display_name,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: 'category', value: 'affilie_commission_validated' }],
        });
        console.log(
          '%s validated-email-sent affiliate=%s amount=%d',
          LOG_PREFIX,
          prospect.affiliate_id,
          commissionEurHt,
        );
      } catch (mailErr) {
        console.warn(
          '%s validated-email-failed affiliate=%s msg=%s',
          LOG_PREFIX,
          prospect.affiliate_id,
          mailErr instanceof Error ? mailErr.message : String(mailErr),
        );
      }
    } else {
      console.log(
        '%s validated-email-skipped no-contact-email affiliate=%s',
        LOG_PREFIX,
        prospect.affiliate_id,
      );
    }
  } catch (err) {
    console.error(
      '%s unexpected-error prospect=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
