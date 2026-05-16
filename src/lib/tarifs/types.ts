/**
 * P6.x.1a — types partagés UI/server pour le module Tarifs.
 */

export type TarifCategory = 'pack' | 'sponsor' | 'option' | 'service' | 'autre';

export const TARIF_CATEGORIES: TarifCategory[] = ['pack', 'sponsor', 'option', 'service', 'autre'];

export const CATEGORY_LABELS: Record<TarifCategory, string> = {
  pack: 'Pack',
  sponsor: 'Sponsor',
  option: 'Option',
  service: 'Service',
  autre: 'Autre',
};

/** Couleurs Tailwind par catégorie. Cohérent avec design-tokens du repo. */
export const CATEGORY_COLOR_CLASSES: Record<TarifCategory, string> = {
  pack: 'bg-md-blue/10 text-md-blue',
  sponsor: 'bg-amber-100 text-amber-800',
  option: 'bg-slate-100 text-slate-700',
  service: 'bg-emerald-100 text-emerald-800',
  autre: 'bg-muted text-md-text-muted',
};

export interface SellsyMirrorProduct {
  sellsy_item_id: number;
  reference: string;
  name: string | null;
  description: string | null;
  price_excl_tax: number | null;
  is_archived: boolean;
  synced_at: string;
}

export interface TariffEditorialRow {
  id: string;
  sellsy_product_id: number;
  category: TarifCategory;
  sub_category: string | null;
  display_order: number;
  featured: boolean;
  editorial_title: string | null;
  tagline: string | null;
  description_md: string | null;
  image_url: string | null;
  tags: string[];
  target_audience: string | null;
  value_proposition: string | null;
  is_visible_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductWithEditorial {
  sellsy: SellsyMirrorProduct;
  editorial: TariffEditorialRow | null;
}
