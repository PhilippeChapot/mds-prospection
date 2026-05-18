'use server';

/**
 * P6.x.5 / P6.x.5-ter — server actions Devis Builder.
 *
 *   - saveQuoteDraftAction : persiste quote_items (avec discount_pct par
 *     item) + promo_reason (justification globale) + estimated_amount.
 *     Ne touche jamais à pack_code (cf. P6.x.5-bis Option A).
 *
 *   - emitSellsyDevisFromQuoteBuilderAction : émet le devis Sellsy en
 *     passant le row.discount structuré { unit:'percent', value }
 *     ligne par ligne (P6.x.5-ter, remplace l'approche unit_amount remisé).
 *     PREMIUM toujours à 0% (forcé par clampDiscountForItem).
 *     Ce chemin est PARALLÈLE à `runPostConversion` (qui dépend de
 *     public_signup_attempts.step2_payload, absent pour les leads landing).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sellsyFetch } from '@/lib/sellsy/client';
import { syncProspectToSellsy } from '@/lib/sellsy/sync-prospect';
import { endpointForDocumentType } from '@/lib/sellsy/create-document';
import { SellsyError } from '@/lib/sellsy/client';
import { calculateQuoteTotals, clampDiscountForItem, type QuoteItem } from './quote-calc';

const LOG_PREFIX = '[admin/quote-builder]';
const VAT_RATE_DEFAULT = 20;

// P6.x.5-ter : chaque item porte son discount_pct
const quoteItemSchema = z.object({
  sellsy_product_id: z.number().int().positive(),
  reference: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(300),
  unit_price_ht: z.number().nonnegative(),
  qty: z.number().int().min(1).max(99),
  category: z.string().trim().min(1).max(40),
  sub_category: z.string().trim().max(60).nullable(),
  is_premium: z.boolean(),
  discount_pct: z.number().min(0).max(100).default(0),
});

const saveDraftSchema = z.object({
  prospect_id: z.string().uuid(),
  quote_items: z.array(quoteItemSchema).max(50),
  promo_reason: z.string().trim().max(500).nullable(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type SaveDraftResult =
  | { ok: true; saved_at: string; total_ht: number }
  | { ok: false; error: string };

export async function saveQuoteDraftAction(input: SaveDraftInput): Promise<SaveDraftResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin' && profile.role !== 'sales') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  // Normalisation défensive : PREMIUM forcé à 0 (le clamp UI ne suffit pas).
  const items: QuoteItem[] = data.quote_items.map((it) => ({
    ...it,
    discount_pct: clampDiscountForItem(it),
  }));
  const totals = calculateQuoteTotals(items, VAT_RATE_DEFAULT);

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('prospects')
    .update({
      quote_items: items as unknown as never,
      promo_reason: data.promo_reason,
      ...(items.length > 0 ? { estimated_amount: totals.total_ht } : {}),
    })
    .eq('id', data.prospect_id);

  if (error) {
    console.error(
      '%s save-draft-failed prospect=%s msg=%s',
      LOG_PREFIX,
      data.prospect_id,
      error.message,
    );
    return { ok: false, error: error.message };
  }

  console.log(
    '%s draft-saved prospect=%s items=%d total_ht=%d',
    LOG_PREFIX,
    data.prospect_id,
    items.length,
    totals.total_ht,
  );
  revalidatePath(`/admin/prospects/${data.prospect_id}`);
  return { ok: true, saved_at: new Date().toISOString(), total_ht: totals.total_ht };
}

// ---------------------------------------------------------------------------
// emitSellsyDevisFromQuoteBuilderAction
// ---------------------------------------------------------------------------

const emitSchema = z.object({ prospect_id: z.string().uuid() });

export type EmitResult =
  | {
      ok: true;
      sellsy_devis_id: string;
      sellsy_devis_number: string | null;
      total_ht: number;
    }
  | { ok: false; error: string };

interface SellsyRowPayload {
  type: 'catalog';
  quantity: string;
  related: { id: number; type: 'product' };
  unit_amount?: string;
  /** P6.x.5-sexies — row.discount Sellsy V2 (format officiel, audité depuis
   *  l'OpenAPI sellsy.v2.latest.yaml). Shape :
   *    { type: 'percent' | 'amount', value: <STRING> }
   *  La key est `type` (PAS `unit` comme on tentait en P6.x.5-ter — c'est
   *  ce qui causait le 400). La `value` est une STRING (cohérent avec
   *  quirk #15 sur quantity/unit_amount). */
  discount?: { type: 'percent' | 'amount'; value: string };
}

export async function emitSellsyDevisFromQuoteBuilderAction(input: {
  prospect_id: string;
}): Promise<EmitResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Seul un admin peut émettre un devis Sellsy.' };
  }
  const parsed = emitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'prospect_id invalide' };

  const supabase = getSupabaseServiceClient();
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select(
      `id, quote_items, promo_reason, sellsy_devis_id, sellsy_devis_number,
       acompte_payment_link_id, is_test,
       company:companies!inner(id, name, sellsy_id),
       contact:contacts(sellsy_contact_id, email, first_name, language)`,
    )
    .eq('id', parsed.data.prospect_id)
    .maybeSingle();

  if (pErr || !prospect) {
    return { ok: false, error: 'Prospect introuvable' };
  }

  const items = (prospect.quote_items ?? []) as unknown as QuoteItem[];
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Aucun produit sélectionné' };
  }

  // P6.x.5-nonies : ré-émission — capture l'ancien devis avant la sync
  // pour pouvoir l'annuler après création du nouveau.
  const oldSellsyDevisId = prospect.sellsy_devis_id ? Number(prospect.sellsy_devis_id) : null;
  const oldSellsyDevisNumber = prospect.sellsy_devis_number ?? null;
  const oldPaymentLinkId = prospect.acompte_payment_link_id ?? null;

  // 1. Sync Sellsy (find-or-create company) pour s'assurer du sellsy_id
  await syncProspectToSellsy(parsed.data.prospect_id);

  // 2. Re-fetch company sellsy_id post-sync
  const { data: companyRow } = await supabase
    .from('companies')
    .select('sellsy_id')
    .eq('id', (Array.isArray(prospect.company) ? prospect.company[0] : prospect.company).id)
    .maybeSingle();
  const sellsyCompanyId = companyRow?.sellsy_id;
  if (!sellsyCompanyId) {
    return {
      ok: false,
      error: 'Sync Sellsy company échoué — la sync prospect doit poser sellsy_id.',
    };
  }

  // 3. Build rows Sellsy V2 avec row.discount natif (format officiel OpenAPI
  //    audité — cf. note sur SellsyRowPayload). unit_amount = prix catalogue,
  //    Sellsy applique la remise et affiche le % séparé dans la colonne
  //    dédiée de la grille Sellsy.
  const rows: SellsyRowPayload[] = items.map((it) => {
    const pct = clampDiscountForItem(it);
    const row: SellsyRowPayload = {
      type: 'catalog',
      quantity: String(it.qty),
      related: { id: it.sellsy_product_id, type: 'product' },
      unit_amount: Number(it.unit_price_ht).toFixed(2),
    };
    if (pct > 0) {
      row.discount = { type: 'percent', value: pct.toString() };
    }
    return row;
  });

  // 4. Note Sellsy : justification libre uniquement (la remise par ligne
  //    est désormais visible dans la colonne native Sellsy, pas besoin
  //    de doubler dans la note — évite la redondance vue par le client).
  const note = prospect.promo_reason?.trim() || undefined;

  const contactRow = Array.isArray(prospect.contact) ? prospect.contact[0] : prospect.contact;

  const payload = {
    related: [{ type: 'company' as const, id: Number(sellsyCompanyId) }],
    rows,
    public_link_enabled: true,
    ...(note ? { note } : {}),
    ...(contactRow?.sellsy_contact_id ? { contact_id: Number(contactRow.sellsy_contact_id) } : {}),
  };

  // 5. POST /estimates
  // P6.x.5-quinquies : on log le payload complet AVANT le call pour pouvoir
  // diagnostiquer rapidement une erreur Sellsy future (côté Vercel logs).
  console.log(
    '%s sellsy-post-estimates prospect=%s payload=%s',
    LOG_PREFIX,
    parsed.data.prospect_id,
    JSON.stringify(payload),
  );
  let documentId: number;
  try {
    const createdRaw = await sellsyFetch<unknown>(endpointForDocumentType('estimate'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const obj = (createdRaw as { data?: { id?: number }; id?: number }) ?? {};
    documentId = obj.data?.id ?? obj.id ?? 0;
    if (!documentId || documentId <= 0) {
      console.error(
        '%s sellsy-no-id prospect=%s payload=%j',
        LOG_PREFIX,
        parsed.data.prospect_id,
        payload,
      );
      return { ok: false, error: 'Sellsy n’a pas renvoyé d’id' };
    }
  } catch (err) {
    // P6.x.5-quinquies : on extrait le body Sellsy de l'exception pour le
    // surfacer dans le toast admin — sans ça, l'admin ne voit qu'un 400
    // opaque côté UI et doit aller dans les logs Vercel.
    let bodyDetails = '';
    if (err instanceof SellsyError && err.body) {
      try {
        const serialized = JSON.stringify(err.body);
        bodyDetails = ` — Sellsy: ${serialized.slice(0, 500)}`;
      } catch {
        /* noop */
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '%s sellsy-create-failed prospect=%s msg=%s body=%s',
      LOG_PREFIX,
      parsed.data.prospect_id,
      msg,
      bodyDetails,
    );
    return { ok: false, error: `Émission Sellsy échouée : ${msg}${bodyDetails}` };
  }

  // 6. Fetch détails (number, public_link) — best-effort
  let devisNumber: string | null = null;
  let publicUrl: string | null = null;
  let totalTtc: number | null = null;
  try {
    type SellsyDoc = {
      number?: string;
      amounts?: { total?: string; total_excl_tax?: string };
      public_link?: string | null;
      public_link_enabled?: boolean;
      pdf_link?: string | null;
    };
    const res = await sellsyFetch<{ data?: SellsyDoc } & SellsyDoc>(
      `${endpointForDocumentType('estimate')}/${documentId}`,
    );
    const d: SellsyDoc = (res as { data?: SellsyDoc }).data ?? (res as SellsyDoc);
    devisNumber = d.number ?? null;
    publicUrl = (d.public_link_enabled && d.public_link) || d.pdf_link || null;
    totalTtc = d.amounts?.total ? Number(d.amounts.total) : null;
  } catch (err) {
    console.warn('%s fetch-details-failed doc=%d msg=%s', LOG_PREFIX, documentId, String(err));
  }

  // 7. Update prospect : sellsy_devis_* + status='devis_envoye' (si lead)
  const now = new Date().toISOString();
  const totals = calculateQuoteTotals(items, VAT_RATE_DEFAULT);

  await supabase
    .from('prospects')
    .update({
      sellsy_devis_id: String(documentId),
      sellsy_devis_number: devisNumber,
      sellsy_devis_public_url: publicUrl,
      sellsy_devis_emitted_at: now,
      sellsy_devis_total_ttc: totalTtc,
      estimated_amount: totals.total_ht,
    })
    .eq('id', parsed.data.prospect_id);

  // Status transition lead → devis_envoye (ne régresse pas si plus avancé)
  await supabase
    .from('prospects')
    .update({ status: 'devis_envoye', last_activity_at: now })
    .eq('id', parsed.data.prospect_id)
    .eq('status', 'lead');

  console.log(
    '%s devis-emitted prospect=%s doc=%d number=%s total_ht=%d',
    LOG_PREFIX,
    parsed.data.prospect_id,
    documentId,
    devisNumber ?? '-',
    totals.total_ht,
  );

  // P6.x.5-nonies — si on remplace un ancien devis : annulation Sellsy +
  // désactivation Stripe payment link + commentaire de traçabilité +
  // email client + audit log. Tout best-effort : un échec côté Sellsy
  // (devis déjà signé/payé) ou Stripe (lien déjà archivé) ne bloque pas
  // l'émission du nouveau qui vient d'aboutir.
  if (oldSellsyDevisId && oldSellsyDevisId !== documentId) {
    await runReemissionCleanup({
      oldSellsyDevisId,
      oldSellsyDevisNumber,
      oldPaymentLinkId,
      newSellsyDevisId: documentId,
      newSellsyDevisNumber: devisNumber,
      newDevisUrl: publicUrl,
      newTotalTtc: totalTtc,
      prospectId: parsed.data.prospect_id,
      isTest: prospect.is_test === true,
      contact: (() => {
        const c = Array.isArray(prospect.contact) ? prospect.contact[0] : prospect.contact;
        return c
          ? {
              email: c.email as string | null,
              first_name: c.first_name as string | null,
              language: c.language as 'FR' | 'EN' | null,
            }
          : null;
      })(),
      companyName:
        (Array.isArray(prospect.company) ? prospect.company[0] : prospect.company)?.name ?? '',
      adminUserId: profile.id,
    });
  }

  revalidatePath(`/admin/prospects/${parsed.data.prospect_id}`);
  return {
    ok: true,
    sellsy_devis_id: String(documentId),
    sellsy_devis_number: devisNumber,
    total_ht: totals.total_ht,
  };
}

// ---------------------------------------------------------------------------
// P6.x.5-nonies — runReemissionCleanup
// ---------------------------------------------------------------------------

interface ReemissionContext {
  oldSellsyDevisId: number;
  oldSellsyDevisNumber: string | null;
  oldPaymentLinkId: string | null;
  newSellsyDevisId: number;
  newSellsyDevisNumber: string | null;
  newDevisUrl: string | null;
  newTotalTtc: number | null;
  prospectId: string;
  isTest: boolean;
  contact: {
    email: string | null;
    first_name: string | null;
    language: 'FR' | 'EN' | null;
  } | null;
  companyName: string;
  adminUserId: string;
}

/**
 * Orchestre les étapes de fin de ré-émission. Best-effort sur chaque
 * étape (jamais throw) — on log un warning si quelque chose échoue, mais
 * le nouveau devis Sellsy reste valide.
 */
async function runReemissionCleanup(ctx: ReemissionContext): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // 1. Annuler l'ancien devis Sellsy (PUT /estimates/{id}/status cancelled).
  const { cancelSellsyDevis, addCommentToSellsyDevis } = await import('@/lib/sellsy/cancel-devis');
  const reason = `Devis remplacé par ${ctx.newSellsyDevisNumber ?? `#${ctx.newSellsyDevisId}`} suite à modification du Devis Builder`;
  const cancelResult = await cancelSellsyDevis({
    sellsy_devis_id: ctx.oldSellsyDevisId,
    reason,
  });

  // 2. Désactiver le Stripe payment link associé (best-effort).
  if (ctx.oldPaymentLinkId && !ctx.isTest) {
    const { cancelStripePaymentLink } = await import('@/lib/stripe/cancel-payment-link');
    await cancelStripePaymentLink(ctx.oldPaymentLinkId);
  }
  // Nettoie aussi les colonnes prospect (le lien n'est plus exploitable).
  if (ctx.oldPaymentLinkId) {
    await supabase
      .from('prospects')
      .update({
        acompte_payment_link_id: null,
        acompte_payment_link_url: null,
        acompte_payment_link_expires_at: null,
      })
      .eq('id', ctx.prospectId);
  }

  // 3. Ajouter un commentaire de traçabilité sur l'ancien devis Sellsy.
  if (cancelResult.cancelled) {
    await addCommentToSellsyDevis({
      sellsy_devis_id: ctx.oldSellsyDevisId,
      comment: reason,
    });
  }

  // 4. Email "Devis mis à jour" au prospect (sauf is_test).
  if (!ctx.isTest && ctx.contact?.email) {
    try {
      const { renderProspectDevisUpdated } =
        await import('@/lib/resend/templates/prospect-devis-updated');
      const { sendTransactionalEmailViaResend } = await import('@/lib/resend/client');
      const locale = ctx.contact.language === 'EN' ? 'en' : 'fr';
      const formatter = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', {
        style: 'currency',
        currency: 'EUR',
      });
      const tpl = renderProspectDevisUpdated(locale, {
        firstName: ctx.contact.first_name ?? '',
        companyName: ctx.companyName,
        newDevisNumber: ctx.newSellsyDevisNumber ?? `#${ctx.newSellsyDevisId}`,
        oldDevisNumber: ctx.oldSellsyDevisNumber,
        newTotalTtc: formatter.format(ctx.newTotalTtc ?? 0),
        newDevisUrl: ctx.newDevisUrl ?? `https://go.sellsy.com/estimates/${ctx.newSellsyDevisId}`,
        senderEmail: process.env.RESEND_DEFAULT_FROM_EMAIL ?? 'philippe@mediadays.solutions',
      });
      await sendTransactionalEmailViaResend({
        to: ctx.contact.email,
        toName: ctx.contact.first_name ?? undefined,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: 'category', value: 'prospect_devis_updated' }],
      });
      console.log(
        '%s reemit-email-sent prospect=%s to=%s',
        LOG_PREFIX,
        ctx.prospectId,
        ctx.contact.email,
      );
    } catch (err) {
      console.warn(
        '%s reemit-email-failed prospect=%s msg=%s',
        LOG_PREFIX,
        ctx.prospectId,
        err instanceof Error ? err.message : String(err),
      );
    }
  } else if (ctx.isTest) {
    console.log('%s reemit-email-skipped reason=is_test prospect=%s', LOG_PREFIX, ctx.prospectId);
  }

  // 5. Audit log — action 'update' avec metadata typed pour le timeline UI.
  //    On n'a pas d'enum 'devis_reemit' dans audit_action, donc on utilise
  //    'update' + un champ before/after explicite pour signaler la ré-émission.
  try {
    await supabase.from('audit_log').insert({
      user_id: ctx.adminUserId,
      action: 'update',
      entity_type: 'prospects',
      entity_id: ctx.prospectId,
      before: {
        kind: 'devis_reemit',
        sellsy_devis_id: String(ctx.oldSellsyDevisId),
        sellsy_devis_number: ctx.oldSellsyDevisNumber,
      } as never,
      after: {
        kind: 'devis_reemit',
        sellsy_devis_id: String(ctx.newSellsyDevisId),
        sellsy_devis_number: ctx.newSellsyDevisNumber,
        cancelled_old: cancelResult.cancelled,
        cancelled_old_message: cancelResult.message ?? null,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s reemit-audit-failed prospect=%s msg=%s',
      LOG_PREFIX,
      ctx.prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(
    '%s reemit-cleanup-done prospect=%s old=%d new=%d cancelled=%s',
    LOG_PREFIX,
    ctx.prospectId,
    ctx.oldSellsyDevisId,
    ctx.newSellsyDevisId,
    cancelResult.cancelled,
  );
}
