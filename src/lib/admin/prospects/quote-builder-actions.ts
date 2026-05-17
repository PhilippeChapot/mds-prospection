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
import {
  calculateQuoteTotals,
  clampDiscountForItem,
  discountedUnitPriceHt,
  formatEurFr,
  type QuoteItem,
} from './quote-calc';

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
  /** P6.x.5-quinquies — unit_amount déjà remisé côté client. On a tenté en
   *  P6.x.5-ter le champ structuré `row.discount = { unit:'percent', value }`
   *  mais Sellsy V2 renvoie 400 sur ce format (cf. retour Phil). Format
   *  alternatif (discount_value, discount_percent, etc.) non documenté
   *  côté API publique → fallback safe : prix unitaire déjà remisé +
   *  traçabilité dans la `note` du devis. */
  unit_amount?: string;
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
      `id, quote_items, promo_reason, sellsy_devis_id,
       company:companies!inner(id, sellsy_id),
       contact:contacts(sellsy_contact_id)`,
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

  // 3. Build rows Sellsy V2 avec unit_amount déjà remisé (P6.x.5-quinquies
  //    fallback safe — cf. note sur SellsyRowPayload).
  const rows: SellsyRowPayload[] = items.map((it) => {
    const unitDiscounted = discountedUnitPriceHt(it);
    return {
      type: 'catalog',
      quantity: String(it.qty),
      related: { id: it.sellsy_product_id, type: 'product' },
      unit_amount: unitDiscounted.toFixed(2),
    };
  });

  // 4. Note Sellsy : justification + traçabilité comptable ligne par ligne.
  //    Sellsy ne voyant pas la remise comme % séparé, on documente dans la
  //    note le prix catalogue + % remise + prix net appliqué, pour que la
  //    compta puisse rapprocher avec le tarif officiel.
  const anyDiscount = items.some((it) => clampDiscountForItem(it) > 0);
  const noteLines: string[] = [];
  if (prospect.promo_reason) {
    noteLines.push(prospect.promo_reason);
    noteLines.push('');
  }
  if (anyDiscount) {
    noteLines.push('Remises appliquées :');
    for (const it of items) {
      const pct = clampDiscountForItem(it);
      if (pct === 0) continue;
      const net = discountedUnitPriceHt(it);
      noteLines.push(
        `• ${it.name} — Prix catalogue ${formatEurFr(it.unit_price_ht)} · ` +
          `Remise ${pct}% appliquée → ${formatEurFr(net)} HT/unité`,
      );
    }
  }
  const note = noteLines.length > 0 ? noteLines.join('\n').trim() : undefined;

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

  revalidatePath(`/admin/prospects/${parsed.data.prospect_id}`);
  return {
    ok: true,
    sellsy_devis_id: String(documentId),
    sellsy_devis_number: devisNumber,
    total_ht: totals.total_ht,
  };
}
