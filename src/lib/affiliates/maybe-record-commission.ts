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
        company:companies!inner(vat_country, vat_verified)
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
    const isAutoliquidation = isAutoliquidationApplicable(
      company?.vat_country ?? null,
      company?.vat_verified ?? null,
    );

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, commission_percent, display_name')
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
