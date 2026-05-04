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

  // 2. Build line items
  const items = await buildLineItems(draft);

  // 3. POST /v2/documents
  const payload = {
    type,
    related: [{ type: 'company' as const, id: Number(company.sellsy_id) }],
    items,
    // Note Sellsy : on peut passer un contact_id pour rattacher le devis
    // a un contact specifique. Champ optionnel, pas critique pour M3.
    ...(contact?.sellsy_contact_id ? { contact_id: Number(contact.sellsy_contact_id) } : {}),
  };

  const createdRaw = await sellsyFetch<unknown>('/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const documentId = extractSellsyId(createdRaw, '/documents');
  const total = items.reduce((acc, it) => acc + it.unit_amount * it.quantity, 0);

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

interface SellsyLineItem {
  id: number;
  quantity: number;
  unit_amount: number;
  // tax_id optionnel pour P4 M3 (TVA standard implicite cote Sellsy).
  // Sera ajoute en M7 pour autoliquidation UE.
}

/**
 * Construit la liste des lignes Sellsy depuis le step2_payload.
 * - Pack (1 ligne)
 * - Supplement Marseille si applicable (1 ligne — TODO en P4 M3.x si Sellsy
 *   exige un item dedicacé. Pour M3 minimum viable on l'omet et on documente.)
 * - Addons (N lignes)
 */
async function buildLineItems(draft: Step2DraftCaseA): Promise<SellsyLineItem[]> {
  const items: SellsyLineItem[] = [];

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
  items.push({
    id: packItemId,
    quantity: 1,
    unit_amount: Number(tier.price_eur_ht),
  });

  // Note : le supplement Marseille n'a pas son propre item Sellsy a date.
  // 2 options : (a) augmenter le prix du pack si marseilleSelected, ou
  // (b) creer un item Sellsy dedie. Pour M3 viable, on additionne au pack.
  if (draft.marseilleSelected && tier.marseille_supplement_eur_ht != null) {
    items[items.length - 1].unit_amount += Number(tier.marseille_supplement_eur_ht);
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
      items.push({
        id: addonItemId,
        quantity: 1,
        unit_amount: Number(addon.price_eur_ht),
      });
    }
  }

  console.log('%s line-items count=%d', LOG_PREFIX, items.length);
  return items;
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
