/**
 * Mapping pricing_tiers / addon_options -> Sellsy item_id.
 *
 * Strategie :
 *   1. Lecture de sellsy_item_id en DB (column ajoutee migration 0022).
 *   2. Si null mais sellsy_sku set, search Sellsy /items/search par
 *      reference exacte, UPDATE en DB (cache persistent), retourne.
 *   3. Si sellsy_sku aussi null, throw une erreur explicite avec la
 *      commande SQL UPDATE pour aider l'admin a corriger.
 *
 * Cache module-scope pour eviter les multiples fetch lors d'un meme devis
 * (typiquement 4-5 line items qui partagent quelques SKUs entre eux).
 *
 * Logs structures (prefix [sellsy/products]) pour grep Vercel Logs.
 *
 * NB : la table sellsy_products_mirror existe (P0 M3, schema V1) mais
 * n'est pas encore peuplee. M5 fera le sync mass via cron quotidien.
 * En attendant, on utilise ce helper en lazy lookup au 1er devis.
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sellsy/products]';

// Cache sku -> item_id (module-scope). Reset entre tests via export.
const itemIdCache = new Map<string, number>();

export function _resetSellsyProductsCacheForTests() {
  itemIdCache.clear();
}

export class SellsyMappingError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'SellsyMappingError';
  }
}

/**
 * Recupere l'item_id Sellsy pour un pricing_tier MDS.
 * Cache 3 niveaux : memoire -> DB -> Sellsy API.
 */
export async function getSellsyItemIdForPricingTier(tierId: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { data: tier, error } = await supabase
    .from('pricing_tiers')
    .select('id, sellsy_sku, sellsy_item_id, pack_code, category')
    .eq('id', tierId)
    .maybeSingle();

  if (error || !tier) {
    throw new SellsyMappingError(`pricing_tier ${tierId} introuvable.`);
  }

  if (tier.sellsy_item_id) {
    return Number(tier.sellsy_item_id);
  }

  if (!tier.sellsy_sku) {
    throw new SellsyMappingError(
      `pricing_tier ${tier.pack_code}/${tier.category} sans sellsy_sku. ` +
        `A renseigner via : UPDATE pricing_tiers SET sellsy_sku='MDS-PACK-...' WHERE id='${tier.id}';`,
    );
  }

  const itemId = await resolveItemIdBySku(tier.sellsy_sku);
  await supabase.from('pricing_tiers').update({ sellsy_item_id: itemId }).eq('id', tier.id);
  console.log(
    '%s pricing-tier-mapped tier_id=%s sku=%s item_id=%d',
    LOG_PREFIX,
    tier.id,
    tier.sellsy_sku,
    itemId,
  );
  return itemId;
}

/**
 * Recupere l'item_id Sellsy pour un addon_option MDS.
 */
export async function getSellsyItemIdForAddon(addonId: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { data: addon, error } = await supabase
    .from('addon_options')
    .select('id, code, sellsy_sku, sellsy_item_id')
    .eq('id', addonId)
    .maybeSingle();

  if (error || !addon) {
    throw new SellsyMappingError(`addon_option ${addonId} introuvable.`);
  }

  if (addon.sellsy_item_id) {
    return Number(addon.sellsy_item_id);
  }

  if (!addon.sellsy_sku) {
    throw new SellsyMappingError(
      `addon_option ${addon.code} sans sellsy_sku. ` +
        `A renseigner via : UPDATE addon_options SET sellsy_sku='MDS-ADDON-...' WHERE id='${addon.id}';`,
    );
  }

  const itemId = await resolveItemIdBySku(addon.sellsy_sku);
  await supabase.from('addon_options').update({ sellsy_item_id: itemId }).eq('id', addon.id);
  console.log(
    '%s addon-mapped addon_id=%s code=%s sku=%s item_id=%d',
    LOG_PREFIX,
    addon.id,
    addon.code,
    addon.sellsy_sku,
    itemId,
  );
  return itemId;
}

/**
 * Recherche un item Sellsy par reference exacte (= sellsy_sku MDS).
 * Cache memoire module-scope.
 */
async function resolveItemIdBySku(sku: string): Promise<number> {
  const cached = itemIdCache.get(sku);
  if (cached) {
    console.log('%s cache-hit sku=%s item_id=%d', LOG_PREFIX, sku, cached);
    return cached;
  }

  // Filter exact match sur reference. Sellsy V2 supporte reference dans filters.
  const res = await sellsyFetch<{ data: Array<{ id: number; reference?: string }> }>(
    '/items/search?limit=5',
    {
      method: 'POST',
      body: JSON.stringify({
        filters: { reference: sku },
      }),
    },
  );

  // Sellsy peut retourner des matches partiels — on filtre exact.
  const exact = (res.data ?? []).find((it) => it.reference === sku);
  if (!exact) {
    throw new SellsyMappingError(
      `Sellsy item avec reference="${sku}" introuvable. ` +
        `Verifier le catalogue Sellsy et la valeur sellsy_sku en DB.`,
    );
  }

  itemIdCache.set(sku, exact.id);
  console.log('%s resolved-from-api sku=%s item_id=%d', LOG_PREFIX, sku, exact.id);
  return exact.id;
}
