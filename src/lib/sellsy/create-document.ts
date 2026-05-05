/**
 * Émission d'un document Sellsy (devis / facture pro-forma / facture)
 * pour un prospect MDS.
 *
 * 4 parcours business :
 *   - devis_sepa            -> 'estimate' (devis classique)
 *   - devis_acompte_stripe  -> 'estimate' (devis + acompte Stripe en M4)
 *   - proforma_acompte      -> 'proforma'
 *   - facture_integrale     -> 'invoice'
 *
 * Source des donnees :
 *   - prospect : pack_code, payment_path, estimated_amount (denormalise P3 M4)
 *   - public_signup_attempts.step2_payload : detail des choix (pack
 *     pricing_tier, addons selectionnes, salons paris+marseille...).
 *
 * Build du payload Sellsy V2 :
 *   - related: [{ type: 'company', id }] (1 seul type, cf. quirk #7 P4 M2)
 *   - items: array de { id (sellsy_item_id), quantity, unit_amount, tax_id? }
 *     Lignes calculees :
 *       1. Pack (pricing_tier selon category derivee)
 *       2. Supplement Marseille si marseille_selected
 *       3. N addons selectionnes
 *   - TVA : 20% standard FR. Autoliquidation UE non-FR ajoute en P4 M7
 *     (necessite VIES verification + tax_id Sellsy 0%).
 *
 * Logs structures (prefix [sellsy/create-doc]).
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  getSellsyItemIdForPricingTier,
  getSellsyItemIdForAddon,
  SellsyMappingError,
} from './products-mapping';

const LOG_PREFIX = '[sellsy/create-doc]';

/**
 * Type de document Sellsy. Mapping depuis payment_path :
 *   devis_sepa             -> estimate
 *   devis_acompte_stripe   -> estimate
 *   proforma_acompte       -> proforma
 *   facture_integrale      -> invoice
 */
export type SellsyDocumentType = 'estimate' | 'proforma' | 'invoice';

export function paymentPathToDocumentType(
  paymentPath: string | null | undefined,
): SellsyDocumentType {
  switch (paymentPath) {
    case 'proforma_acompte':
      return 'proforma';
    case 'facture_integrale':
      return 'invoice';
    case 'devis_sepa':
    case 'devis_acompte_stripe':
    default:
      return 'estimate';
  }
}

interface Step2DraftCaseA {
  mode?: string;
  pricingTierId?: string;
  marseilleSelected?: boolean;
  addonIds?: string[];
}

export async function createSellsyDocument(
  prospectId: string,
  type: SellsyDocumentType,
): Promise<{ documentId: number; total: number }> {
  console.log('%s start prospect_id=%s type=%s', LOG_PREFIX, prospectId, type);

  const supabase = getSupabaseServiceClient();

  // 1. Lookup prospect + company.sellsy_id + step2_payload (depuis le signup parent)
  const { data: prospectRow, error: pErr } = await supabase
    .from('prospects')
    .select(
      `
      id, is_test, pack_code, selected_addon_ids, payment_path,
      company:companies!inner(name, sellsy_id),
      contact:contacts(sellsy_contact_id)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (pErr || !prospectRow) {
    throw new SellsyMappingError(`prospect ${prospectId} introuvable`);
  }

  const company = pickFirst(prospectRow.company);
  const contact = pickFirst(prospectRow.contact);
  if (!company?.sellsy_id) {
    throw new SellsyMappingError(
      `company.sellsy_id manquant pour prospect ${prospectId} — la sync Sellsy doit d'abord s'executer.`,
    );
  }

  // Recupere le step2_payload original (Cas A uniquement — les Cas B
  // n'emettent pas de devis automatique car pas de pricing fixe).
  const { data: signup } = await supabase
    .from('public_signup_attempts')
    .select('step2_payload')
    .eq('converted_to_prospect_id', prospectId)
    .maybeSingle();

  const draft = (signup?.step2_payload as Step2DraftCaseA | null) ?? null;
  if (!draft || draft.mode !== 'caseA' || !draft.pricingTierId) {
    throw new SellsyMappingError(
      `prospect ${prospectId} : step2_payload Cas A introuvable (cas B non eligible au devis auto).`,
    );
  }

  // 2. Build rows (cf. quirk #10..#14 memory bank pour la shape exacte).
  const rows = await buildRows(draft);

  // 3. POST sur l'endpoint type. Sellsy V2 expose des endpoints separes
  //    par type de document, pas un /documents generique :
  //      estimate -> /estimates
  //      proforma -> /proformas
  //      invoice  -> /invoices
  //    => 404 si on POST /documents (cf. quirk #8 memory bank).
  //    Le type n'a donc plus besoin d'etre passe en body.
  const endpoint = endpointForDocumentType(type);

  const payload = {
    related: [{ type: 'company' as const, id: Number(company.sellsy_id) }],
    rows,
    // Note Sellsy : on peut passer un contact_id pour rattacher le devis
    // a un contact specifique. Champ optionnel, pas critique pour M3.
    ...(contact?.sellsy_contact_id ? { contact_id: Number(contact.sellsy_contact_id) } : {}),
  };

  const createdRaw = await sellsyFetch<unknown>(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const documentId = extractSellsyId(createdRaw, endpoint);
  // Total HT calcule depuis les rows (string -> number) pour le log seulement.
  const total = rows.reduce((acc, r) => acc + Number(r.unit_amount ?? 0) * Number(r.quantity), 0);

  console.log(
    '%s success prospect_id=%s type=%s document_id=%d total_ht=%d',
    LOG_PREFIX,
    prospectId,
    type,
    documentId,
    total,
  );

  return { documentId, total };
}

/**
 * Shape d'une ligne Sellsy V2 (rows[]) — quirks #10..#15 memory bank :
 *   - field name : "rows" (pas "items")
 *   - type : "catalog" (pas "single" / "item" / "product")
 *   - related : OBJET unique { id, type } (pas un array)
 *   - related.type : "product" (pas "item") — enum["product","service"]
 *   - tax_id : integer (pas tax_rate)
 *   - quantity + unit_amount : STRINGS (pas numbers !) — confirme par le
 *     schema OpenAPI Sellsy V2 (rows[].quantity / unit_amount type:"string")
 */
interface SellsyRow {
  type: 'catalog';
  /** STRING par spec Sellsy V2. Format "1" ou "1.00". */
  quantity: string;
  related: { id: number; type: 'product' };
  /** Override du prix catalogue. STRING par spec Sellsy V2.
   *  Format "1980.00" (2 decimales). */
  unit_amount?: string;
  /** Override du tax_id catalogue (integer Sellsy). Pour P4 M3 on laisse
   *  le catalog-default (20% standard FR). M7 ajoutera le tax_id 0% pour
   *  autoliquidation UE. */
  tax_id?: number;
}

/**
 * Construit la liste des rows Sellsy depuis le step2_payload.
 * - Pack (1 row)
 * - Supplement Marseille si applicable (mergee dans le prix du pack — voir
 *   note ci-dessous, TODO P4 M3.x si Sellsy exige un item dedie)
 * - Addons (N rows)
 */
async function buildRows(draft: Step2DraftCaseA): Promise<SellsyRow[]> {
  const rows: SellsyRow[] = [];

  // ----- Pack -----
  if (!draft.pricingTierId) {
    throw new SellsyMappingError('step2_payload sans pricingTierId');
  }
  const supabase = getSupabaseServiceClient();
  const { data: tier } = await supabase
    .from('pricing_tiers')
    .select('id, price_eur_ht, marseille_supplement_eur_ht')
    .eq('id', draft.pricingTierId)
    .single();

  if (!tier) {
    throw new SellsyMappingError(`pricing_tier ${draft.pricingTierId} introuvable`);
  }

  const packItemId = await getSellsyItemIdForPricingTier(draft.pricingTierId);
  // Note : Marseille supplement merge dans le prix du pack (pas d'item dedie
  // Sellsy a date). Calcule AVANT push pour eviter une mutation post-push.
  const packAmount =
    Number(tier.price_eur_ht) +
    (draft.marseilleSelected ? Number(tier.marseille_supplement_eur_ht ?? 0) : 0);
  rows.push({
    type: 'catalog',
    quantity: '1',
    related: { id: packItemId, type: 'product' },
    unit_amount: formatAmount(packAmount),
  });
  if (draft.marseilleSelected && tier.marseille_supplement_eur_ht != null) {
    console.log(
      '%s marseille-merged-into-pack supp=%d',
      LOG_PREFIX,
      tier.marseille_supplement_eur_ht,
    );
  }

  // ----- Addons -----
  if (draft.addonIds && draft.addonIds.length > 0) {
    for (const addonId of draft.addonIds) {
      const { data: addon } = await supabase
        .from('addon_options')
        .select('id, price_eur_ht')
        .eq('id', addonId)
        .single();
      if (!addon) continue;

      const addonItemId = await getSellsyItemIdForAddon(addonId);
      rows.push({
        type: 'catalog',
        quantity: '1',
        related: { id: addonItemId, type: 'product' },
        unit_amount: formatAmount(Number(addon.price_eur_ht)),
      });
    }
  }

  console.log('%s rows count=%d', LOG_PREFIX, rows.length);
  return rows;
}

// ---------------------------------------------------------------------------
// Helpers (dupliques de sync-prospect.ts pour eviter circular imports — on
// pourra mutualiser dans un sellsy/_helpers.ts en finitions si besoin).
// ---------------------------------------------------------------------------

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Formate un montant EUR en string Sellsy V2 (2 decimales fixes, point decimal).
 * Ex : 1980 -> "1980.00", 1980.5 -> "1980.50". Quirk #15.
 */
export function formatAmount(n: number): string {
  return n.toFixed(2);
}

/**
 * Mapping type document -> endpoint Sellsy V2.
 * Quirk #8 : Sellsy V2 n'a PAS de /documents generique. Chaque type
 * possede son propre endpoint plurialise.
 */
export function endpointForDocumentType(type: SellsyDocumentType): string {
  switch (type) {
    case 'estimate':
      return '/estimates';
    case 'proforma':
      return '/proformas';
    case 'invoice':
      return '/invoices';
  }
}

function extractSellsyId(response: unknown, endpoint: string): number {
  if (!response || typeof response !== 'object') {
    throw new Error(
      `Sellsy ${endpoint} response non-object: ${JSON.stringify(response).slice(0, 200)}`,
    );
  }
  const obj = response as { id?: unknown; data?: { id?: unknown } };
  const candidate = obj.data?.id ?? obj.id;
  if (typeof candidate !== 'number') {
    throw new Error(
      `Sellsy ${endpoint} response sans id numerique: ${JSON.stringify(response).slice(0, 300)}`,
    );
  }
  return candidate;
}
