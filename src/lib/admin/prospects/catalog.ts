/**
 * P6.x.5 — catalogue produits pour le Devis Builder admin.
 *
 * Lit `tariff_editorial` JOIN `sellsy_products_mirror`, retourne TOUS les
 * produits non-archivés (peu importe `is_visible_public` — admin a la
 * pleine visibilité, contrairement à l'espace partenaire qui filtre).
 *
 * Inclut `pack` (les packs ne sont jamais exposés au catalogue public
 * commande complémentaire, mais sont obligatoires côté devis admin).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isMdsReference } from '@/lib/sellsy/mds-filter';
import { detectIsPremium, type QuoteItem } from './quote-calc';

export type AdminCatalogCategory = 'pack' | 'option' | 'sponsor' | 'service';

export interface AdminCatalogProduct {
  sellsy_product_id: number;
  reference: string;
  name: string;
  category: AdminCatalogCategory;
  sub_category: string | null;
  editorial_title: string | null;
  tagline: string | null;
  unit_price_ht: number;
  is_premium: boolean;
  is_archived: boolean;
  is_visible_public: boolean;
}

interface SellsyJoin {
  reference: string;
  name: string | null;
  price_excl_tax: number | string | null;
  is_archived: boolean;
}
interface Row {
  sellsy_product_id: number;
  category: string;
  sub_category: string | null;
  editorial_title: string | null;
  tagline: string | null;
  is_visible_public: boolean;
  display_order: number;
  sellsy: SellsyJoin | SellsyJoin[] | null;
}

function pickOne<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getCatalogForAdminQuote(): Promise<AdminCatalogProduct[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('tariff_editorial')
    .select(
      `sellsy_product_id, category, sub_category, editorial_title, tagline,
       is_visible_public, display_order,
       sellsy:sellsy_products_mirror!inner(reference, name, price_excl_tax, is_archived)`,
    )
    .order('category', { ascending: true })
    .order('display_order', { ascending: true });
  if (error) {
    console.error('[admin/catalog] fetch failed: %s', error.message);
    return [];
  }
  const rows = (data ?? []) as Row[];
  const out: AdminCatalogProduct[] = [];
  for (const r of rows) {
    const s = pickOne(r.sellsy);
    if (!s) continue;
    if (s.is_archived) continue;
    // P6.x.1a-quinquies : defense in depth — ignorer toute reference non-MDS.
    if (!isMdsReference(s.reference)) continue;
    if (!['pack', 'option', 'sponsor', 'service'].includes(r.category)) continue;
    out.push({
      sellsy_product_id: r.sellsy_product_id,
      reference: s.reference,
      name: s.name ?? s.reference,
      category: r.category as AdminCatalogCategory,
      sub_category: r.sub_category,
      editorial_title: r.editorial_title,
      tagline: r.tagline,
      unit_price_ht: Number(s.price_excl_tax ?? 0),
      is_premium: detectIsPremium({ sub_category: r.sub_category, reference: s.reference }),
      is_archived: s.is_archived,
      is_visible_public: r.is_visible_public,
    });
  }
  return out;
}

export function catalogProductToQuoteItem(p: AdminCatalogProduct, qty: number): QuoteItem {
  return {
    sellsy_product_id: p.sellsy_product_id,
    reference: p.reference,
    name: p.editorial_title || p.name,
    unit_price_ht: p.unit_price_ht,
    qty,
    category: p.category,
    sub_category: p.sub_category,
    is_premium: p.is_premium,
    discount_pct: 0, // P6.x.5-ter : init à 0, admin peut éditer ensuite
  };
}
