/**
 * P6.x.1a — queries server-side pour /admin/tarifs.
 *
 * Source des produits : `sellsy_products_mirror` (populée par cron quotidien
 * + bouton manuel /admin/sellsy-products). Pas d'appel live à Sellsy ici —
 * trop lent + rate-limit. La fraîcheur du miroir est suffisante (sync 1×/jour).
 *
 * Catégorie implicite : si pas de ligne tariff_editorial pour un sellsy_item_id,
 * on affiche category='autre' + display_order=9999 côté UI.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MDS_REFERENCE_ILIKE_PATTERN } from '@/lib/sellsy/mds-filter';
import type { ProductWithEditorial, SellsyMirrorProduct, TariffEditorialRow } from './types';

export interface ListProductsFilters {
  /** Recherche texte sur sellsy.name + reference. */
  q?: string | null;
  /** Filtre par catégorie. Inclut 'autre' implicite si présent dans la liste. */
  categories?: string[] | null;
  /** Si true, ne retourne que les produits sans ligne tariff_editorial. */
  untaggedOnly?: boolean | null;
  /** Si true, ne retourne que les produits featured (impossible si untaggedOnly). */
  featuredOnly?: boolean | null;
  /** Inclure les produits Sellsy archivés (par défaut : false). */
  includeArchived?: boolean | null;
}

/**
 * Liste tous les produits Sellsy miroirs avec leur ligne éditoriale jointe
 * (LEFT JOIN côté JS). Tri : display_order asc puis nom asc.
 */
export async function listProductsWithEditorial(
  filters: ListProductsFilters = {},
): Promise<ProductWithEditorial[]> {
  const supabase = await createSupabaseServerClient();

  let productsQ = supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id, reference, name, description, price_excl_tax, is_archived, synced_at')
    // P6.x.1a-quinquies : defense in depth — meme si la sync filtre deja,
    // on garde un filtre cote query pour ignorer les rows polluees
    // (ex import manuel ou bypass futur). Pattern MDS-* case-insensitive.
    .ilike('reference', MDS_REFERENCE_ILIKE_PATTERN)
    .order('reference', { ascending: true });

  if (!filters.includeArchived) {
    productsQ = productsQ.eq('is_archived', false);
  }
  if (filters.q && filters.q.trim().length >= 2) {
    const term = `%${filters.q.trim()}%`;
    productsQ = productsQ.or(`name.ilike.${term},reference.ilike.${term}`);
  }

  const [{ data: productsRaw, error: productsErr }, { data: editorialsRaw, error: edErr }] =
    await Promise.all([productsQ, supabase.from('tariff_editorial').select('*')]);

  if (productsErr) {
    console.error('[tarifs/admin-queries] products fetch failed', productsErr.message);
    return [];
  }
  if (edErr) {
    console.error('[tarifs/admin-queries] editorial fetch failed', edErr.message);
  }

  const products = (productsRaw ?? []) as SellsyMirrorProduct[];
  const editorials = (editorialsRaw ?? []) as TariffEditorialRow[];
  const byProductId = new Map<number, TariffEditorialRow>(
    editorials.map((e) => [Number(e.sellsy_product_id), e]),
  );

  let rows: ProductWithEditorial[] = products.map((p) => ({
    sellsy: p,
    editorial: byProductId.get(Number(p.sellsy_item_id)) ?? null,
  }));

  // Filtre catégorie : inclut le bucket 'autre' implicite si présent.
  if (filters.categories && filters.categories.length > 0) {
    const set = new Set(filters.categories);
    rows = rows.filter((r) => {
      const cat = r.editorial?.category ?? 'autre';
      return set.has(cat);
    });
  }

  if (filters.untaggedOnly) {
    rows = rows.filter((r) => r.editorial === null);
  }
  if (filters.featuredOnly) {
    rows = rows.filter((r) => r.editorial?.featured === true);
  }

  // Tri : display_order asc, puis nom asc (FR locale). Implicite 'autre' = 9999.
  rows.sort((a, b) => {
    const orderA = a.editorial?.display_order ?? 9999;
    const orderB = b.editorial?.display_order ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.sellsy.name ?? a.sellsy.reference;
    const nameB = b.sellsy.name ?? b.sellsy.reference;
    return nameA.localeCompare(nameB, 'fr');
  });

  return rows;
}

export interface TarifsCounters {
  total: number;
  tagged: number;
  untagged: number;
  featured: number;
  hiddenFromPublic: number;
}

export async function getTarifsCounters(): Promise<TarifsCounters> {
  const supabase = await createSupabaseServerClient();
  const [{ count: total }, { count: tagged }, { count: featured }, { count: hidden }] =
    await Promise.all([
      supabase
        .from('sellsy_products_mirror')
        .select('sellsy_item_id', { count: 'exact', head: true })
        .ilike('reference', MDS_REFERENCE_ILIKE_PATTERN)
        .eq('is_archived', false),
      supabase.from('tariff_editorial').select('id', { count: 'exact', head: true }),
      supabase
        .from('tariff_editorial')
        .select('id', { count: 'exact', head: true })
        .eq('featured', true),
      supabase
        .from('tariff_editorial')
        .select('id', { count: 'exact', head: true })
        .eq('is_visible_public', false),
    ]);
  return {
    total: total ?? 0,
    tagged: tagged ?? 0,
    untagged: Math.max(0, (total ?? 0) - (tagged ?? 0)),
    featured: featured ?? 0,
    hiddenFromPublic: hidden ?? 0,
  };
}
