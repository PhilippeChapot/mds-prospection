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
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sellsyFetch } from '@/lib/sellsy/client';
import { syncProspectToSellsy } from '@/lib/sellsy/sync-prospect';
import { endpointForDocumentType, type SellsyDocumentType } from '@/lib/sellsy/create-document';
import { SellsyError } from '@/lib/sellsy/client';
import { logSellsyCall } from '@/lib/sellsy/sync-logger';
import { calculateQuoteTotals, clampDiscountForItem, type QuoteItem } from './quote-calc';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

/**
 * P5.x.SellsyDocumentsFlow — escape hatch typage : billing_contact_id /
 * billing_email_override / purchase_order_number sur prospects + table
 * document_requests ne sont pas encore dans database.types.ts (générés
 * après `pnpm db:push` de la migration 0103). On caste donc le service
 * client en SupabaseClient (Database=any) pour ces opérations untypées.
 * Même pattern que P11.x.MultiPartnerAccess.
 */
const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

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
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
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
  if (!hasAdminAccess(profile.role)) {
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
       contact:contacts!primary_contact_id(sellsy_contact_id, email, first_name, language)`,
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
      await logSellsyCall({
        entityType: 'prospects',
        entityId: parsed.data.prospect_id,
        operation: 'create',
        status: 'error',
        errorMessage: 'Sellsy /estimates : pas d’id retourné',
        payload: { request: payload, response: createdRaw },
      });
      return { ok: false, error: 'Sellsy n’a pas renvoyé d’id' };
    }
    await logSellsyCall({
      entityType: 'prospects',
      entityId: parsed.data.prospect_id,
      operation: 'create',
      status: 'success',
      payload: { sellsy_devis_id: documentId, rows_count: rows.length },
    });
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
    await logSellsyCall({
      entityType: 'prospects',
      entityId: parsed.data.prospect_id,
      operation: 'create',
      status: 'error',
      errorMessage: msg,
      payload: {
        request: payload,
        response: err instanceof SellsyError ? err.body : null,
      },
    });
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
  // P6.x.6 : reset des champs last_sync_error_* car l'émission a réussi
  // (la sync individual peut avoir échoué en amont via collision email
  // collaborateur, mais le devis est bien créé → la carte "Synchronisations
  // externes" doit afficher Sellsy ✅).
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
      last_synced_sellsy_at: now,
      last_sync_error_at: null,
      last_sync_error_message: null,
      last_sync_error_provider: null,
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
// P5.x.SellsyDocumentsFlow — émission pro-forma / facture
// ---------------------------------------------------------------------------

const emitTypedSchema = z.object({
  prospect_id: z.string().uuid(),
  document_type: z.enum(['proforma', 'invoice']),
  purchase_order_number: z.string().trim().max(100).nullable().optional(),
  billing_contact_id: z.string().uuid().nullable().optional(),
  billing_email_override: z.string().email().nullable().optional(),
  /** Si l'émission vient d'une demande partenaire (document_requests). */
  request_id: z.string().uuid().nullable().optional(),
});

export type EmitTypedInput = z.infer<typeof emitTypedSchema>;
export type EmitTypedResult =
  | {
      ok: true;
      sellsy_document_id: string;
      sellsy_document_number: string | null;
      public_url: string | null;
      total_ht: number;
    }
  | { ok: false; error: string };

/** Famille de colonnes prospect selon le type de document. */
function columnsForType(type: 'proforma' | 'invoice'): {
  id: string;
  number: string;
  publicUrl: string;
  emittedAt: string;
} {
  if (type === 'proforma') {
    return {
      id: 'sellsy_proforma_id',
      number: 'sellsy_proforma_number',
      publicUrl: 'sellsy_proforma_public_url',
      emittedAt: 'sellsy_proforma_emitted_at',
    };
  }
  return {
    id: 'sellsy_invoice_id',
    number: 'sellsy_invoice_number',
    publicUrl: 'sellsy_invoice_public_url',
    emittedAt: 'sellsy_invoice_emitted_at',
  };
}

/**
 * Émet une pro-forma ou une facture Sellsy à partir des `quote_items` du
 * prospect (même source de vérité que le devis). Parallèle à
 * `emitSellsyDevisFromQuoteBuilderAction` (qui gère le devis + sa
 * ré-émission spécifique) — ici PAS de cleanup ré-émission : une pro-forma
 * ou une facture ne se ré-émettent pas silencieusement (anti-doublon strict
 * par type).
 *
 * Le numéro de bon de commande (facture) et le contact de facturation sont
 * transmis à Sellsy :
 *   - PO → mention dans la `note` du document (champ Sellsy V2 confirmé).
 *   - billing contact → `contact_id` Sellsy si le contact a un
 *     sellsy_contact_id ; email externe → mention dans la note.
 *
 * MDS Prospection crée le document + pré-remplit le destinataire ; l'envoi
 * du PDF reste manuel côté Sellsy (décision Phil — Sellsy gère tracking +
 * relances natives).
 */
export async function emitSellsyTypedDocumentAction(
  input: EmitTypedInput,
): Promise<EmitTypedResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Seul un admin peut émettre un document Sellsy.' };
  }
  const parsed = emitTypedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }
  const { prospect_id, document_type } = parsed.data;
  const po = parsed.data.purchase_order_number?.trim() || null;

  const supabase = getSupabaseServiceClient();
  const cols = columnsForType(document_type);

  // 1. Fetch prospect + quote_items + company + contacts + colonnes billing.
  //    Lecture via client casté (any) car billing_* / colonne cible ne sont
  //    pas encore dans les types générés.
  const { data: prospect, error: pErr } = await asAnyDb(supabase)
    .from('prospects')
    .select(
      `id, quote_items, promo_reason, is_test, billing_contact_id, billing_email_override,
       sellsy_proforma_id, sellsy_invoice_id,
       company:companies!inner(id, name, sellsy_id),
       contact:contacts!primary_contact_id(sellsy_contact_id)`,
    )
    .eq('id', prospect_id)
    .maybeSingle();

  if (pErr || !prospect) {
    return { ok: false, error: 'Prospect introuvable' };
  }

  // 2. Anti-doublon : un seul document de ce type par prospect.
  const existingDocId = (prospect as Record<string, unknown>)[cols.id] as string | null;
  if (existingDocId) {
    const label = document_type === 'proforma' ? 'pro-forma' : 'facture';
    return {
      ok: false,
      error: `Une ${label} a déjà été émise (Sellsy #${existingDocId}). Annule-la dans Sellsy avant d'en réémettre une.`,
    };
  }

  const items = (prospect.quote_items ?? []) as unknown as QuoteItem[];
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      error: 'Aucun produit dans le Devis Builder — ajoute des produits avant d’émettre.',
    };
  }

  // 3. Sync company Sellsy (find-or-create) puis relit sellsy_id.
  await syncProspectToSellsy(prospect_id);
  const companyId = (Array.isArray(prospect.company) ? prospect.company[0] : prospect.company)?.id;
  const { data: companyRow } = await supabase
    .from('companies')
    .select('sellsy_id')
    .eq('id', companyId)
    .maybeSingle();
  const sellsyCompanyId = companyRow?.sellsy_id;
  if (!sellsyCompanyId) {
    return { ok: false, error: 'Sync Sellsy company échoué — sellsy_id absent.' };
  }

  // 4. Build rows (identique au devis : discount par ligne, PREMIUM clampé).
  const rows: SellsyRowPayload[] = items.map((it) => {
    const pct = clampDiscountForItem(it);
    const row: SellsyRowPayload = {
      type: 'catalog',
      quantity: String(it.qty),
      related: { id: it.sellsy_product_id, type: 'product' },
      unit_amount: Number(it.unit_price_ht).toFixed(2),
    };
    if (pct > 0) row.discount = { type: 'percent', value: pct.toString() };
    return row;
  });

  // 5. Résolution du contact de facturation.
  //    Priorité : billing_contact_id passé > billing_contact_id du prospect
  //    > contact principal. L'email externe (override) n'a pas de
  //    sellsy_contact_id → mentionné dans la note.
  const billingContactId =
    parsed.data.billing_contact_id ??
    ((prospect as Record<string, unknown>).billing_contact_id as string | null) ??
    null;
  const billingEmailOverride =
    parsed.data.billing_email_override ??
    ((prospect as Record<string, unknown>).billing_email_override as string | null) ??
    null;

  let billingSellsyContactId: number | null = null;
  if (billingContactId) {
    const { data: bc } = await supabase
      .from('contacts')
      .select('sellsy_contact_id')
      .eq('id', billingContactId)
      .maybeSingle();
    billingSellsyContactId = bc?.sellsy_contact_id ? Number(bc.sellsy_contact_id) : null;
  }
  const primaryContact = Array.isArray(prospect.contact) ? prospect.contact[0] : prospect.contact;
  const fallbackSellsyContactId = primaryContact?.sellsy_contact_id
    ? Number(primaryContact.sellsy_contact_id)
    : null;
  const sellsyContactId = billingSellsyContactId ?? fallbackSellsyContactId;

  // 6. Note Sellsy : justification + bon de commande + email facturation externe.
  const noteParts: string[] = [];
  if (prospect.promo_reason?.trim()) noteParts.push(prospect.promo_reason.trim());
  if (po) noteParts.push(`Bon de commande N° ${po}`);
  if (billingEmailOverride && !billingContactId) {
    noteParts.push(`Facturation à : ${billingEmailOverride}`);
  }
  const note = noteParts.length > 0 ? noteParts.join('\n') : undefined;

  const payload = {
    related: [{ type: 'company' as const, id: Number(sellsyCompanyId) }],
    rows,
    public_link_enabled: true,
    ...(note ? { note } : {}),
    ...(sellsyContactId ? { contact_id: sellsyContactId } : {}),
  };

  // 7. POST sur l'endpoint type.
  const endpoint = endpointForDocumentType(document_type as SellsyDocumentType);
  console.log(
    '%s sellsy-post-%s prospect=%s payload=%s',
    LOG_PREFIX,
    document_type,
    prospect_id,
    JSON.stringify(payload),
  );
  let documentId: number;
  try {
    const createdRaw = await sellsyFetch<unknown>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const obj = (createdRaw as { data?: { id?: number }; id?: number }) ?? {};
    documentId = obj.data?.id ?? obj.id ?? 0;
    if (!documentId || documentId <= 0) {
      await logSellsyCall({
        entityType: 'prospects',
        entityId: prospect_id,
        operation: 'create',
        status: 'error',
        errorMessage: `Sellsy ${endpoint} : pas d’id retourné`,
        payload: { request: payload, response: createdRaw },
      });
      return { ok: false, error: 'Sellsy n’a pas renvoyé d’id' };
    }
    await logSellsyCall({
      entityType: 'prospects',
      entityId: prospect_id,
      operation: 'create',
      status: 'success',
      payload: { document_type, sellsy_document_id: documentId, rows_count: rows.length },
    });
  } catch (err) {
    let bodyDetails = '';
    if (err instanceof SellsyError && err.body) {
      try {
        bodyDetails = ` — Sellsy: ${JSON.stringify(err.body).slice(0, 500)}`;
      } catch {
        /* noop */
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '%s sellsy-create-%s-failed prospect=%s msg=%s',
      LOG_PREFIX,
      document_type,
      prospect_id,
      msg,
    );
    await logSellsyCall({
      entityType: 'prospects',
      entityId: prospect_id,
      operation: 'create',
      status: 'error',
      errorMessage: msg,
      payload: { request: payload, response: err instanceof SellsyError ? err.body : null },
    });
    return { ok: false, error: `Émission Sellsy échouée : ${msg}${bodyDetails}` };
  }

  // 8. Fetch détails (number, public_link, total) — best-effort.
  let docNumber: string | null = null;
  let publicUrl: string | null = null;
  try {
    type SellsyDoc = {
      number?: string;
      public_link?: string | null;
      public_link_enabled?: boolean;
      pdf_link?: string | null;
    };
    const res = await sellsyFetch<{ data?: SellsyDoc } & SellsyDoc>(`${endpoint}/${documentId}`);
    const d: SellsyDoc = (res as { data?: SellsyDoc }).data ?? (res as SellsyDoc);
    docNumber = d.number ?? null;
    publicUrl = (d.public_link_enabled && d.public_link) || d.pdf_link || null;
  } catch (err) {
    console.warn('%s fetch-details-failed doc=%d msg=%s', LOG_PREFIX, documentId, String(err));
  }

  // 9. Update prospect : colonnes du type + persistance billing/PO.
  const now = new Date().toISOString();
  const totals = calculateQuoteTotals(items, VAT_RATE_DEFAULT);
  const updatePatch: Record<string, unknown> = {
    [cols.id]: String(documentId),
    [cols.number]: docNumber,
    [cols.publicUrl]: publicUrl,
    [cols.emittedAt]: now,
    last_synced_sellsy_at: now,
  };
  if (po) updatePatch.purchase_order_number = po;
  if (parsed.data.billing_contact_id !== undefined)
    updatePatch.billing_contact_id = parsed.data.billing_contact_id;
  if (parsed.data.billing_email_override !== undefined)
    updatePatch.billing_email_override = parsed.data.billing_email_override;

  await asAnyDb(supabase).from('prospects').update(updatePatch).eq('id', prospect_id);

  // 10. Si émission liée à une demande partenaire → approve + lien.
  if (parsed.data.request_id) {
    await asAnyDb(supabase)
      .from('document_requests')
      .update({
        status: 'approved',
        decided_by_user_id: profile.id,
        decided_at: now,
        sellsy_document_id: String(documentId),
        updated_at: now,
      })
      .eq('id', parsed.data.request_id);
  }

  // 11. Audit log.
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    action: 'create',
    entity_type: 'sellsy_document',
    entity_id: String(documentId),
    after: {
      kind: 'sellsy_document_emitted',
      document_type,
      prospect_id,
      purchase_order_number: po,
      via_request_id: parsed.data.request_id ?? null,
    } as never,
  });

  console.log(
    '%s typed-doc-emitted prospect=%s type=%s doc=%d number=%s',
    LOG_PREFIX,
    prospect_id,
    document_type,
    documentId,
    docNumber ?? '-',
  );

  revalidatePath(`/admin/prospects/${prospect_id}`);
  return {
    ok: true,
    sellsy_document_id: String(documentId),
    sellsy_document_number: docNumber,
    public_url: publicUrl,
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
