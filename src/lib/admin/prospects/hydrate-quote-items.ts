/**
 * P6.x.5-octies — hydrate `prospects.quote_items` JSONB depuis la sélection
 * captée par le wizard public (pack_code + selected_addon_ids).
 *
 * Appelé :
 *   - À la conversion signup → prospect (convertSignupToProspect) pour
 *     pré-remplir le Devis Builder de l'admin
 *   - En backfill one-shot pour les prospects historiques convertis avant
 *     ce milestone (script scripts/backfill-quote-items.ts)
 *
 * Mécanisme :
 *   1. Pack : reconstruit la référence Sellsy via resolvePackReference()
 *      (pattern MDS-PACK-{tier}-{pack_code}-{venue}, venue=PARIS toujours
 *      — Marseille est un supplement séparé, pas un pack), puis lookup
 *      sellsy_products_mirror par reference.
 *   2. Addons : selected_addon_ids contient des UUIDs de addon_options
 *      → join sur addon_options.sellsy_item_id → sellsy_products_mirror.
 *   3. Pour chaque produit, join tariff_editorial pour récupérer
 *      category / sub_category / is_premium.
 *
 * Tout est best-effort : un produit non résolvable est skippé + warning,
 * les autres continuent. La fonction ne throw jamais.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { detectIsPremium, type QuoteItem } from './quote-calc';

export type PackCode = 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';

const LOG_PREFIX = '[admin/hydrate-quote-items]';

export interface HydrateInput {
  pack_code: PackCode | null;
  selected_addon_ids: string[];
  /** events_interest du prospect (ex. ['paris', 'marseille']) — sert à
   *  désambiguer la venue dans la référence Sellsy. Marseille n'a pas de
   *  pack dédié (supplement à la place), donc on prend toujours Paris. */
  events_interest?: string[] | null;
  /** companies.category (`prs_exhibitor` ou autre) — détermine le tier
   *  Sellsy (PRSEXH vs STD). Fallback STD si non défini. */
  categorie?: string | null;
}

export interface HydrateResult {
  quote_items: QuoteItem[];
  warnings: string[];
}

/**
 * Reconstruit la référence Sellsy d'un pack depuis pack_code + categorie.
 * Pattern (cf. seed Sellsy auto-classify regex P6.x.1a-quater) :
 *   MDS-PACK-{tier}-{pack_code}-PARIS
 * où tier ∈ {STD, PRSEXH}.
 *
 * @returns la référence ou null si pack non-résolvable (A_DEFINIR, valeur
 *          enum inattendue, etc.).
 */
export function resolvePackReference(
  pack_code: PackCode | string | null,
  _events_interest?: string[] | null,
  categorie?: string | null,
): string | null {
  if (!pack_code) return null;
  if (!['ACCESS', 'CLASSIC', 'PREMIUM'].includes(pack_code)) return null;
  const tier = categorie === 'prs_exhibitor' ? 'PRSEXH' : 'STD';
  // venue : toujours PARIS — pas de pack MARSEILLE dans le catalogue Sellsy
  // (Marseille est un supplement, pas un pack distinct).
  return `MDS-PACK-${tier}-${pack_code}-PARIS`;
}

interface SellsyProductLookup {
  sellsy_item_id: number;
  reference: string;
  name: string | null;
  price_excl_tax: number | string | null;
}

async function fetchSellsyProductByReference(
  reference: string,
): Promise<SellsyProductLookup | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id, reference, name, price_excl_tax')
    .eq('reference', reference)
    .maybeSingle();
  return (data as SellsyProductLookup | null) ?? null;
}

interface EditorialLookup {
  category: string;
  sub_category: string | null;
}

async function fetchEditorialByProductId(sellsyItemId: number): Promise<EditorialLookup | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('tariff_editorial')
    .select('category, sub_category')
    .eq('sellsy_product_id', sellsyItemId)
    .maybeSingle();
  return (data as EditorialLookup | null) ?? null;
}

/**
 * Lookup addon depuis son UUID applicatif (addon_options.id) → renvoie
 * la row sellsy_products_mirror associée.
 */
async function fetchAddonAsSellsyProduct(
  addonId: string,
): Promise<{ product: SellsyProductLookup | null; addonCode: string | null }> {
  const supabase = getSupabaseServiceClient();
  const { data: addon } = await supabase
    .from('addon_options')
    .select('id, code, sellsy_item_id')
    .eq('id', addonId)
    .maybeSingle();
  if (!addon) return { product: null, addonCode: null };
  if (!addon.sellsy_item_id) return { product: null, addonCode: addon.code };
  const { data: mirror } = await supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id, reference, name, price_excl_tax')
    .eq('sellsy_item_id', addon.sellsy_item_id)
    .maybeSingle();
  return { product: (mirror as SellsyProductLookup | null) ?? null, addonCode: addon.code };
}

function toQuoteItem(
  product: SellsyProductLookup,
  editorial: EditorialLookup | null,
  qty: number,
): QuoteItem {
  const subCategory = editorial?.sub_category ?? null;
  return {
    sellsy_product_id: product.sellsy_item_id,
    reference: product.reference,
    name: product.name ?? product.reference,
    unit_price_ht: Number(product.price_excl_tax) || 0,
    qty,
    discount_pct: 0,
    category: editorial?.category ?? 'autre',
    sub_category: subCategory,
    is_premium: detectIsPremium({ sub_category: subCategory, reference: product.reference }),
  };
}

/**
 * Hydrate la liste quote_items à partir de la sélection wizard.
 * Pure-ish : utilise le supabase service client en lecture (pas de write).
 */
export async function hydrateQuoteItemsFromSelection(input: HydrateInput): Promise<HydrateResult> {
  const items: QuoteItem[] = [];
  const warnings: string[] = [];

  // 1. Pack
  const packCode = input.pack_code ?? null;
  if (packCode && packCode !== 'A_DEFINIR') {
    const reference = resolvePackReference(packCode, input.events_interest, input.categorie);
    if (!reference) {
      warnings.push(
        `Pack ${packCode} non résolvable (events_interest=${JSON.stringify(input.events_interest)} categorie=${input.categorie})`,
      );
    } else {
      const product = await fetchSellsyProductByReference(reference);
      if (!product) {
        warnings.push(`Pack référence ${reference} introuvable dans sellsy_products_mirror`);
      } else {
        const editorial = await fetchEditorialByProductId(product.sellsy_item_id);
        items.push(toQuoteItem(product, editorial, 1));
      }
    }
  }

  // 2. Addons (UUIDs addon_options)
  for (const addonId of input.selected_addon_ids ?? []) {
    if (!addonId || typeof addonId !== 'string') continue;
    const { product, addonCode } = await fetchAddonAsSellsyProduct(addonId);
    if (!product) {
      warnings.push(
        `Addon id=${addonId}${addonCode ? ` (code=${addonCode})` : ''} introuvable ou sans sellsy_item_id`,
      );
      continue;
    }
    const editorial = await fetchEditorialByProductId(product.sellsy_item_id);
    items.push(toQuoteItem(product, editorial, 1));
  }

  if (warnings.length > 0) {
    console.warn('%s warnings=%j', LOG_PREFIX, warnings);
  }
  console.log(
    '%s hydrated items=%d warnings=%d pack=%s addons=%d',
    LOG_PREFIX,
    items.length,
    warnings.length,
    packCode ?? '-',
    (input.selected_addon_ids ?? []).length,
  );

  return { quote_items: items, warnings };
}
