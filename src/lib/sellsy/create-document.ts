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
import { isAutoliquidationApplicable } from '@/lib/vies/verify';
import {
  getSellsyItemIdForPricingTier,
  getSellsyItemIdForAddon,
  SellsyMappingError,
} from './products-mapping';

/**
 * Texte legal autoliquidation TVA (art. 196 dir. 2006/112/CE) ajoute en
 * `note` au document Sellsy quand le client est UE non-FR avec TVA verifiee.
 * Quirk #18 memory bank.
 */
const AUTOLIQUIDATION_NOTE = 'Autoliquidation de la TVA — art. 196 directive 2006/112/CE.';

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

  // Incident 2026-07-08 (WinMedia) — Sellsy V2 n'expose aucun endpoint de
  // creation de pro-forma (verifie sur la spec OpenAPI officielle
  // docs.sellsy.com/api/v2 : ni /proformas, ni /proforma-invoices, ni flag
  // type=proforma sur /estimates ou /invoices). Fail-fast explicite plutot
  // que de laisser sellsyFetch renvoyer un 404 brut sur un endpoint qui
  // n'existera jamais.
  if (type === 'proforma') {
    throw new SellsyMappingError(
      "Sellsy V2 ne permet pas encore la creation de pro-forma via l'API (aucun endpoint disponible). Cree la pro-forma manuellement dans Sellsy.",
    );
  }

  const supabase = getSupabaseServiceClient();

  // 1. Lookup prospect + company.sellsy_id + step2_payload (depuis le signup parent)
  //    vat_country + vat_verified vivent sur companies (pas prospects) — c'est
  //    l'entreprise qui porte la TVA UE, pas le prospect commercial.
  const { data: prospectRow, error: pErr } = await supabase
    .from('prospects')
    .select(
      `
      id, is_test, pack_code, selected_addon_ids, payment_path,
      company:companies!inner(name, sellsy_id, vat_country, vat_verified),
      contact:contacts!primary_contact_id(sellsy_contact_id)
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

  // 2. Resoudre tax_id selon autoliquidation (P4 M7) :
  //    - prospect FR ou non-UE -> taxIdOverride=null (catalog item porte
  //      sa TVA 20% par defaut, on n'override pas)
  //    - prospect UE non-FR + vat_verified='valid' -> override avec
  //      SELLSY_TAX_ID_0_PERCENT + ajoute mention legale en note
  const autoliq = isAutoliquidationApplicable(company.vat_country, company.vat_verified);
  let taxIdOverride: number | null = null;
  if (autoliq) {
    const raw = process.env.SELLSY_TAX_ID_0_PERCENT;
    const id = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && id > 0) {
      taxIdOverride = id;
    } else {
      console.warn(
        '%s autoliquidation-applicable-but-no-tax-id prospect_id=%s — TVA 20%% sera appliquee (set SELLSY_TAX_ID_0_PERCENT)',
        LOG_PREFIX,
        prospectId,
      );
    }
  }

  // 3. Build rows (cf. quirk #10..#14 memory bank pour la shape exacte).
  const rows = await buildRows(draft, taxIdOverride);

  // 4. POST sur l'endpoint type. Sellsy V2 expose des endpoints separes
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
    // Active le lien public Sellsy des la creation. Sans ca, public_link
    // est genere mais inaccessible ("Document inaccessible") car
    // public_link_enabled defaut workspace = false. Quirk #17 memory bank.
    public_link_enabled: true,
    // Mention legale autoliquidation si applicable (P4 M7).
    ...(autoliq && taxIdOverride != null ? { note: AUTOLIQUIDATION_NOTE } : {}),
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
 * Donnees deja resolues (DB + Sellsy item lookup) — input de la pure
 * fonction assembleRows() pour faciliter les tests sans mock Supabase.
 */
export interface AssembleRowsInput {
  pack: { itemId: number; priceHt: number };
  marseille: {
    selected: boolean;
    supplementHt: number | null;
    /** sellsy_item_id du SKU MDS-OPT-*-MARSEILLE. Si null + selected,
     *  on log un warning et on n'emet PAS la row Marseille (le supplement
     *  ne sera pas facture jusqu'a ce que l'admin mappe l'item). */
    itemId: number | null;
  };
  addons: Array<{ itemId: number; priceHt: number }>;
  /** Override du tax_id Sellsy applique a chaque row (P4 M7). Utilise
   *  pour l'autoliquidation TVA UE non-FR : taxIdOverride=SELLSY_TAX_ID_0_PERCENT.
   *  null/undefined = catalog item porte sa propre TVA (20% standard FR). */
  taxIdOverride?: number | null;
}

/**
 * Pure function : assemble les rows Sellsy a partir des donnees deja
 * resolues. Testable sans Supabase ni Sellsy API.
 *
 * Strategie Marseille : 2 rows distinctes (pack + option Marseille) plutot
 * que merge dans le prix pack — meilleure tracabilite comptable Sellsy.
 */
export function assembleRows(input: AssembleRowsInput): SellsyRow[] {
  const taxId = input.taxIdOverride ?? null;
  const withTax = (row: SellsyRow): SellsyRow => (taxId != null ? { ...row, tax_id: taxId } : row);

  const rows: SellsyRow[] = [];

  // 1. Pack Paris (toujours)
  rows.push(
    withTax({
      type: 'catalog',
      quantity: '1',
      related: { id: input.pack.itemId, type: 'product' },
      unit_amount: formatAmount(input.pack.priceHt),
    }),
  );

  // 2. Option Marseille (si selected et item mappe)
  if (input.marseille.selected) {
    if (input.marseille.itemId != null && input.marseille.supplementHt != null) {
      rows.push(
        withTax({
          type: 'catalog',
          quantity: '1',
          related: { id: input.marseille.itemId, type: 'product' },
          unit_amount: formatAmount(input.marseille.supplementHt),
        }),
      );
    } else {
      console.warn(
        '%s marseille-skipped — sellsy_marseille_item_id ou supplement_eur_ht manquant en DB. Le supplement ne sera PAS facture. A fixer via UPDATE pricing_tiers SET sellsy_marseille_item_id=...',
        LOG_PREFIX,
      );
    }
  }

  // 3. Addons (N rows)
  for (const addon of input.addons) {
    rows.push(
      withTax({
        type: 'catalog',
        quantity: '1',
        related: { id: addon.itemId, type: 'product' },
        unit_amount: formatAmount(addon.priceHt),
      }),
    );
  }

  return rows;
}

/**
 * Wrapper qui fetch les donnees DB + resoud les item_id Sellsy puis
 * delegue a la pure assembleRows().
 */
async function buildRows(
  draft: Step2DraftCaseA,
  taxIdOverride: number | null = null,
): Promise<SellsyRow[]> {
  if (!draft.pricingTierId) {
    throw new SellsyMappingError('step2_payload sans pricingTierId');
  }
  const supabase = getSupabaseServiceClient();
  const { data: tier } = await supabase
    .from('pricing_tiers')
    .select('id, price_eur_ht, marseille_supplement_eur_ht, sellsy_marseille_item_id')
    .eq('id', draft.pricingTierId)
    .single();

  if (!tier) {
    throw new SellsyMappingError(`pricing_tier ${draft.pricingTierId} introuvable`);
  }

  const packItemId = await getSellsyItemIdForPricingTier(draft.pricingTierId);

  // Resolve addons en parallele (chaque addon = 2 fetch : option + item_id)
  const addons: AssembleRowsInput['addons'] = [];
  if (draft.addonIds && draft.addonIds.length > 0) {
    for (const addonId of draft.addonIds) {
      const { data: addon } = await supabase
        .from('addon_options')
        .select('id, price_eur_ht')
        .eq('id', addonId)
        .single();
      if (!addon) continue;
      const addonItemId = await getSellsyItemIdForAddon(addonId);
      addons.push({ itemId: addonItemId, priceHt: Number(addon.price_eur_ht) });
    }
  }

  const rows = assembleRows({
    pack: { itemId: packItemId, priceHt: Number(tier.price_eur_ht) },
    marseille: {
      selected: Boolean(draft.marseilleSelected),
      supplementHt:
        tier.marseille_supplement_eur_ht != null ? Number(tier.marseille_supplement_eur_ht) : null,
      itemId: tier.sellsy_marseille_item_id != null ? Number(tier.sellsy_marseille_item_id) : null,
    },
    addons,
    taxIdOverride,
  });

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
