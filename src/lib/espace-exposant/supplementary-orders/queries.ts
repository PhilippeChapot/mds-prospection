/**
 * P6.x.1b — queries server-side pour les commandes complémentaires.
 *
 * - getOrderableCatalog() : produits commandables (option/sponsor/service),
 *   joint tariff_editorial + sellsy_products_mirror, filtré is_visible_public
 *   + non archivé. Tri : featured d'abord, puis display_order, puis nom.
 * - getProspectForExposant(prospectId) : fetch les champs utilisés par
 *   l'éligibilité + l'identification client Stripe (email, sellsy company id).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isMdsReference } from '@/lib/sellsy/mds-filter';

export type OrderableCategory = 'option' | 'sponsor' | 'service';

export interface OrderableProduct {
  sellsy_product_id: number;
  reference: string;
  name: string;
  category: OrderableCategory;
  sub_category: string | null;
  editorial_title: string | null;
  tagline: string | null;
  description_md: string | null;
  image_url: string | null;
  display_order: number;
  featured: boolean;
  unit_price_ht: number;
  tags: string[];
}

export async function getOrderableCatalog(): Promise<OrderableProduct[]> {
  const supabase = getSupabaseServiceClient();

  // On lit toute la table éditoriale visible + on join le miroir Sellsy.
  // PostgREST nested select : `sellsy:sellsy_products_mirror!inner(...)` joint
  // via la FK déjà déclarée (tariff_editorial.sellsy_product_id →
  // sellsy_products_mirror.sellsy_item_id).
  const { data, error } = await supabase
    .from('tariff_editorial')
    .select(
      `sellsy_product_id, category, sub_category, editorial_title, tagline,
       description_md, image_url, display_order, featured, tags,
       sellsy:sellsy_products_mirror!inner(reference, name, price_excl_tax, is_archived)`,
    )
    .in('category', ['option', 'sponsor', 'service'])
    .eq('is_visible_public', true);

  if (error) {
    console.error('[supplementary-orders/queries] fetch catalog failed', error.message);
    return [];
  }

  interface Row {
    sellsy_product_id: number;
    category: string;
    sub_category: string | null;
    editorial_title: string | null;
    tagline: string | null;
    description_md: string | null;
    image_url: string | null;
    display_order: number;
    featured: boolean;
    tags: string[] | null;
    sellsy:
      | {
          reference: string;
          name: string | null;
          price_excl_tax: number | string | null;
          is_archived: boolean;
        }
      | Array<{
          reference: string;
          name: string | null;
          price_excl_tax: number | string | null;
          is_archived: boolean;
        }>
      | null;
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const rows = (data ?? []) as Row[];
  const products: OrderableProduct[] = [];
  for (const r of rows) {
    const sellsy = pickOne(r.sellsy);
    if (!sellsy || sellsy.is_archived) continue;
    // P6.x.1a-quinquies : defense in depth — ignorer toute reference non-MDS.
    if (!isMdsReference(sellsy.reference)) continue;
    const priceNum = sellsy.price_excl_tax != null ? Number(sellsy.price_excl_tax) : NaN;
    if (!Number.isFinite(priceNum)) continue;
    products.push({
      sellsy_product_id: Number(r.sellsy_product_id),
      reference: sellsy.reference,
      name: sellsy.name ?? sellsy.reference,
      category: r.category as OrderableCategory,
      sub_category: r.sub_category,
      editorial_title: r.editorial_title,
      tagline: r.tagline,
      description_md: r.description_md,
      image_url: r.image_url,
      display_order: r.display_order,
      featured: r.featured,
      tags: r.tags ?? [],
      unit_price_ht: priceNum,
    });
  }

  // Tri : featured d'abord, puis display_order asc, puis nom alphabétique FR
  products.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.name.localeCompare(b.name, 'fr');
  });

  return products;
}

export interface ProspectForExposant {
  id: string;
  status: string;
  signed_at: string | null;
  contact_email: string | null;
  company_name: string | null;
  company_sellsy_id: string | null;
}

export async function getProspectForExposant(
  prospectId: string,
): Promise<ProspectForExposant | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('prospects')
    .select(
      `id, status, signed_at,
       contact:contacts!primary_contact_id(email),
       company:companies!inner(name, sellsy_id)`,
    )
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !data) return null;

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const contact = pickOne(data.contact);
  const company = pickOne(data.company);

  return {
    id: data.id,
    status: data.status,
    signed_at: data.signed_at ?? null,
    contact_email: contact?.email ?? null,
    company_name: company?.name ?? null,
    company_sellsy_id: company?.sellsy_id ?? null,
  };
}

export interface SupplementaryOrderDetail {
  id: string;
  prospect_id: string;
  status: string;
  total_ht_eur: number;
  total_ttc_eur: number;
  vat_rate: number;
  items: Array<{
    sellsy_product_id: number;
    reference: string;
    name: string;
    unit_price_ht: number;
    qty: number;
    line_total_ht: number;
  }>;
  customer_note: string | null;
  paid_at: string | null;
  created_at: string;
  sellsy_facture_id: number | null;
  sellsy_facture_number: string | null;
  stripe_checkout_session_id: string | null;
}

export async function getSupplementaryOrderDetail(
  orderId: string,
  prospectId: string,
): Promise<SupplementaryOrderDetail | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('supplementary_orders')
    .select(
      `id, prospect_id, status, total_ht_eur, total_ttc_eur, vat_rate,
       items, customer_note, paid_at, created_at,
       sellsy_facture_id, sellsy_facture_number, stripe_checkout_session_id`,
    )
    .eq('id', orderId)
    .eq('prospect_id', prospectId) // garde-fou : pas d'accès cross-prospect
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id,
    prospect_id: data.prospect_id,
    status: data.status,
    total_ht_eur: Number(data.total_ht_eur),
    total_ttc_eur: Number(data.total_ttc_eur),
    vat_rate: Number(data.vat_rate),
    items: Array.isArray(data.items) ? (data.items as SupplementaryOrderDetail['items']) : [],
    customer_note: data.customer_note,
    paid_at: data.paid_at,
    created_at: data.created_at,
    sellsy_facture_id: data.sellsy_facture_id,
    sellsy_facture_number: data.sellsy_facture_number,
    stripe_checkout_session_id: data.stripe_checkout_session_id,
  };
}

export async function listSupplementaryOrdersForProspect(prospectId: string): Promise<
  Array<{
    id: string;
    status: string;
    total_ttc_eur: number;
    created_at: string;
    paid_at: string | null;
    sellsy_facture_number: string | null;
    item_count: number;
  }>
> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('supplementary_orders')
    .select('id, status, total_ttc_eur, created_at, paid_at, sellsy_facture_number, items')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    status: r.status,
    total_ttc_eur: Number(r.total_ttc_eur),
    created_at: r.created_at,
    paid_at: r.paid_at,
    sellsy_facture_number: r.sellsy_facture_number,
    item_count: Array.isArray(r.items) ? r.items.length : 0,
  }));
}
