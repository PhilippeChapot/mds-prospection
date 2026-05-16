/**
 * Sync produits Sellsy V2 -> mirror local public.sellsy_products_mirror.
 *
 * Strategie :
 *   1. GET /v2/items?limit=100 paginate via offset
 *      (filtre client-side reference.startsWith('MDS-') — Sellsy V2 ne
 *      supporte pas un operateur prefix sur reference dans /items/search,
 *      cf. quirks #1+#2 memory bank. Recuperer tout puis filtrer est plus
 *      robuste sur le volume actuel < 100 items MDS-*.)
 *   2. UPSERT chaque item dans sellsy_products_mirror (sellsy_item_id PK)
 *   3. Auto-mapping : pour chaque pricing_tiers/addon_options avec
 *      sellsy_sku set mais sellsy_item_id null, lookup le item par
 *      reference et UPDATE.
 *   4. Marquer is_archived=true sur les items qui n'apparaissent plus
 *      dans la response Sellsy mais existent en mirror (suppressions).
 *
 * Logs structures (prefix [sellsy/sync-products]).
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sellsy/sync-products]';
const SKU_PREFIX = 'MDS-';
const PAGE_SIZE = 100;

interface SellsyItem {
  id: number;
  reference?: string;
  name?: string;
  description?: string;
  /**
   * P6.x.1a-ter : Sellsy V2 `/items` retourne le prix HT dans `price_excl_tax`
   * (string décimal, ex "1950.00"). Le champ historiquement nommé
   * `unit_amount_excluding_tax` dans le code n'existe PAS dans la réponse —
   * cause du bug de prix null sur /admin/tarifs.
   */
  price_excl_tax?: string | number | null;
  /** Alias historique pour compat, jamais peuplé par Sellsy V2 /items. */
  unit_amount_excluding_tax?: string | number | null;
  tax_id?: number;
  unit_id?: number;
  category_id?: number;
  is_archived?: boolean;
}

export interface SyncProductsResult {
  synced: number;
  autoMapped: number;
  archived: number;
  fetched: number;
  errors: string[];
}

export async function syncSellsyProducts(): Promise<SyncProductsResult> {
  const result: SyncProductsResult = {
    synced: 0,
    autoMapped: 0,
    archived: 0,
    fetched: 0,
    errors: [],
  };

  console.log('%s start', LOG_PREFIX);

  // 1. Recuperer tous les items MDS-* depuis Sellsy (paginated).
  const allItems = await fetchAllMdsItems(result);
  if (allItems.length === 0) {
    console.warn('%s no-items-fetched — aborting (would archive everything)', LOG_PREFIX);
    return result;
  }

  // 2. UPSERT en mirror.
  const supabase = getSupabaseServiceClient();
  const rows = allItems.map((item) => ({
    sellsy_item_id: item.id,
    reference: item.reference ?? `unknown-${item.id}`,
    name: item.name ?? null,
    description: item.description ?? null,
    // P6.x.1a-ter : lit price_excl_tax (V2 field name actuel). Fallback sur
    // unit_amount_excluding_tax pour compat héritage si jamais réactivé.
    price_excl_tax:
      item.price_excl_tax != null
        ? Number(item.price_excl_tax)
        : item.unit_amount_excluding_tax != null
          ? Number(item.unit_amount_excluding_tax)
          : null,
    tax_id: item.tax_id ?? null,
    unit_id: item.unit_id ?? null,
    category_id: item.category_id ?? null,
    is_archived: Boolean(item.is_archived),
    synced_at: new Date().toISOString(),
  }));

  const { error: upErr } = await supabase
    .from('sellsy_products_mirror')
    .upsert(rows, { onConflict: 'sellsy_item_id' });
  if (upErr) {
    result.errors.push(`upsert: ${upErr.message}`);
    console.error('%s upsert-failed msg=%s', LOG_PREFIX, upErr.message);
    return result;
  }
  result.synced = rows.length;

  // 3. Marquer is_archived=true sur les items du mirror absents de la
  //    derniere response Sellsy (suppressions cote Sellsy).
  const fetchedIds = allItems.map((i) => i.id);
  if (fetchedIds.length > 0) {
    const { data: missing } = await supabase
      .from('sellsy_products_mirror')
      .select('sellsy_item_id')
      .not('sellsy_item_id', 'in', `(${fetchedIds.join(',')})`)
      .eq('is_archived', false);
    if (missing && missing.length > 0) {
      const missingIds = missing.map((m) => m.sellsy_item_id);
      const { error: arcErr } = await supabase
        .from('sellsy_products_mirror')
        .update({ is_archived: true, synced_at: new Date().toISOString() })
        .in('sellsy_item_id', missingIds);
      if (arcErr) {
        result.errors.push(`archive: ${arcErr.message}`);
      } else {
        result.archived = missingIds.length;
        console.log('%s archived count=%d', LOG_PREFIX, missingIds.length);
      }
    }
  }

  // 4. Auto-mapping pricing_tiers + addon_options.
  result.autoMapped = await autoMapPricingTiers(allItems, result);
  result.autoMapped += await autoMapAddonOptions(allItems, result);

  console.log(
    '%s done synced=%d auto_mapped=%d archived=%d errors=%d',
    LOG_PREFIX,
    result.synced,
    result.autoMapped,
    result.archived,
    result.errors.length,
  );

  return result;
}

async function fetchAllMdsItems(result: SyncProductsResult): Promise<SellsyItem[]> {
  const all: SellsyItem[] = [];
  let offset = 0;

  while (true) {
    try {
      const res = await sellsyFetch<{ data?: SellsyItem[]; pagination?: { count?: number } }>(
        `/items?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const items = res.data ?? [];
      result.fetched += items.length;

      const mdsItems = items.filter((it) => (it.reference ?? '').startsWith(SKU_PREFIX));
      all.push(...mdsItems);

      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (offset > 5000) {
        // garde-fou : ne pas boucler infiniment si Sellsy retourne >5000 items.
        result.errors.push('pagination-limit-exceeded');
        break;
      }
    } catch (err) {
      result.errors.push(`fetch: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  console.log('%s fetched total=%d filtered_mds=%d', LOG_PREFIX, result.fetched, all.length);
  return all;
}

async function autoMapPricingTiers(
  items: SellsyItem[],
  result: SyncProductsResult,
): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const refToId = new Map<string, number>();
  for (const item of items) {
    if (item.reference) refToId.set(item.reference, item.id);
  }

  const { data: tiers, error } = await supabase
    .from('pricing_tiers')
    .select('id, sellsy_sku, sellsy_item_id')
    .not('sellsy_sku', 'is', null)
    .is('sellsy_item_id', null);
  if (error) {
    result.errors.push(`pricing_tiers-fetch: ${error.message}`);
    return 0;
  }

  let count = 0;
  for (const tier of tiers ?? []) {
    if (!tier.sellsy_sku) continue;
    const itemId = refToId.get(tier.sellsy_sku);
    if (itemId == null) continue;
    const { error: upErr } = await supabase
      .from('pricing_tiers')
      .update({ sellsy_item_id: itemId })
      .eq('id', tier.id);
    if (upErr) {
      result.errors.push(`pricing_tier-update-${tier.id}: ${upErr.message}`);
      continue;
    }
    count++;
    console.log(
      '%s auto-mapped tier=%s sku=%s -> item_id=%d',
      LOG_PREFIX,
      tier.id,
      tier.sellsy_sku,
      itemId,
    );
  }
  return count;
}

async function autoMapAddonOptions(
  items: SellsyItem[],
  result: SyncProductsResult,
): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const refToId = new Map<string, number>();
  for (const item of items) {
    if (item.reference) refToId.set(item.reference, item.id);
  }

  const { data: addons, error } = await supabase
    .from('addon_options')
    .select('id, sellsy_sku, sellsy_item_id')
    .not('sellsy_sku', 'is', null)
    .is('sellsy_item_id', null);
  if (error) {
    result.errors.push(`addon_options-fetch: ${error.message}`);
    return 0;
  }

  let count = 0;
  for (const addon of addons ?? []) {
    if (!addon.sellsy_sku) continue;
    const itemId = refToId.get(addon.sellsy_sku);
    if (itemId == null) continue;
    const { error: upErr } = await supabase
      .from('addon_options')
      .update({ sellsy_item_id: itemId })
      .eq('id', addon.id);
    if (upErr) {
      result.errors.push(`addon-update-${addon.id}: ${upErr.message}`);
      continue;
    }
    count++;
    console.log(
      '%s auto-mapped addon=%s sku=%s -> item_id=%d',
      LOG_PREFIX,
      addon.id,
      addon.sellsy_sku,
      itemId,
    );
  }
  return count;
}

/**
 * Detecte les divergences de prix entre le mirror Sellsy et la DB MDS
 * (pricing_tiers / addon_options). Utile pour /admin/sellsy-products.
 *
 * Une divergence = ABS(prix_db - prix_sellsy) > 0.01 (tolerance arrondi).
 */
export interface PriceDivergence {
  source: 'pricing_tier' | 'addon_option';
  rowId: string;
  rowLabel: string;
  sellsyItemId: number;
  reference: string | null;
  priceDbHt: number;
  priceSellsyHt: number;
}

export async function findPriceDivergences(): Promise<PriceDivergence[]> {
  const supabase = getSupabaseServiceClient();
  const divergences: PriceDivergence[] = [];

  // Pricing tiers
  const { data: tiers } = await supabase
    .from('pricing_tiers')
    .select('id, pack_code, category, price_eur_ht, sellsy_item_id, sellsy_sku')
    .not('sellsy_item_id', 'is', null);
  if (tiers && tiers.length > 0) {
    const tierItemIds = tiers.map((t) => Number(t.sellsy_item_id));
    const { data: mirrorTiers } = await supabase
      .from('sellsy_products_mirror')
      .select('sellsy_item_id, price_excl_tax, reference')
      .in('sellsy_item_id', tierItemIds);
    const byId = new Map<number, { price: number | null; reference: string | null }>();
    for (const m of mirrorTiers ?? []) {
      byId.set(m.sellsy_item_id, { price: m.price_excl_tax, reference: m.reference });
    }
    for (const t of tiers) {
      const m = byId.get(Number(t.sellsy_item_id));
      if (!m || m.price == null) continue;
      const dbPrice = Number(t.price_eur_ht);
      const sellsyPrice = Number(m.price);
      if (Math.abs(dbPrice - sellsyPrice) > 0.01) {
        divergences.push({
          source: 'pricing_tier',
          rowId: t.id,
          rowLabel: `${t.pack_code} / ${t.category}`,
          sellsyItemId: Number(t.sellsy_item_id),
          reference: m.reference,
          priceDbHt: dbPrice,
          priceSellsyHt: sellsyPrice,
        });
      }
    }
  }

  // Addons
  const { data: addons } = await supabase
    .from('addon_options')
    .select('id, code, price_eur_ht, sellsy_item_id, sellsy_sku')
    .not('sellsy_item_id', 'is', null);
  if (addons && addons.length > 0) {
    const addonItemIds = addons.map((a) => Number(a.sellsy_item_id));
    const { data: mirrorAddons } = await supabase
      .from('sellsy_products_mirror')
      .select('sellsy_item_id, price_excl_tax, reference')
      .in('sellsy_item_id', addonItemIds);
    const byId = new Map<number, { price: number | null; reference: string | null }>();
    for (const m of mirrorAddons ?? []) {
      byId.set(m.sellsy_item_id, { price: m.price_excl_tax, reference: m.reference });
    }
    for (const a of addons) {
      const m = byId.get(Number(a.sellsy_item_id));
      if (!m || m.price == null) continue;
      const dbPrice = Number(a.price_eur_ht);
      const sellsyPrice = Number(m.price);
      if (Math.abs(dbPrice - sellsyPrice) > 0.01) {
        divergences.push({
          source: 'addon_option',
          rowId: a.id,
          rowLabel: a.code,
          sellsyItemId: Number(a.sellsy_item_id),
          reference: m.reference,
          priceDbHt: dbPrice,
          priceSellsyHt: sellsyPrice,
        });
      }
    }
  }

  return divergences;
}
