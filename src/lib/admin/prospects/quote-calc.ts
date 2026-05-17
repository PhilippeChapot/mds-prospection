/**
 * P6.x.5 / P6.x.5-ter — calculs pure du Devis Builder.
 *
 * Pure functions sans accès DB ni Sellsy : utilisées à la fois par
 *   - l'UI live recap (QuoteRecap)
 *   - la server action saveQuoteDraftAction (hydrate estimated_amount)
 *   - l'émission Sellsy (passe row.discount.value = item.discount_pct)
 *
 * P6.x.5-ter : la remise n'est plus globale (promo_pct + excludes_premium).
 * Chaque item porte son propre `discount_pct` (0-100). Les items PREMIUM ont
 * leur `discount_pct` forcé à 0 — ils ne sont jamais bradés (doctrine
 * business). On clamp aussi côté UI mais on garde le clamp côté pure
 * function en défense.
 *
 * Doctrine PREMIUM :
 *   - sub_category === 'premium' OU référence Sellsy matche MDS-PACK-PREMIUM-*
 *   - `discount_pct` du PREMIUM est forcé à 0 dans clampDiscountForItem().
 */

export interface QuoteItem {
  sellsy_product_id: number;
  reference: string;
  name: string;
  unit_price_ht: number;
  qty: number;
  category: 'pack' | 'option' | 'sponsor' | 'service' | string;
  sub_category: string | null;
  is_premium: boolean;
  /** P6.x.5-ter : remise spécifique à cet item (0-100). PREMIUM forcé à 0. */
  discount_pct: number;
}

export interface QuoteTotals {
  subtotal_ht: number;
  /** Somme des remises ligne par ligne (cumulées). */
  discount_amount: number;
  total_ht: number;
  vat_amount: number;
  total_ttc: number;
}

/** Détecte si un item est PREMIUM (doctrine : sub_category ou regex référence). */
export function detectIsPremium(input: {
  sub_category: string | null | undefined;
  reference: string | null | undefined;
}): boolean {
  const sub = (input.sub_category ?? '').toLowerCase();
  if (sub === 'premium') return true;
  const ref = input.reference ?? '';
  if (/^MDS-PACK-PREMIUM[-_]/i.test(ref)) return true;
  return false;
}

/** Clamp défensif : PREMIUM forcé à 0, sinon borne [0, 100]. */
export function clampDiscountForItem(item: {
  is_premium: boolean;
  discount_pct: number | null | undefined;
}): number {
  if (item.is_premium) return 0;
  const raw = Number(item.discount_pct) || 0;
  return Math.max(0, Math.min(100, raw));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcule les totaux à partir des items (avec discount_pct par item) + vatRate.
 *
 * @param vatRate 20 pour 20%, etc.
 */
export function calculateQuoteTotals(items: QuoteItem[], vatRate: number): QuoteTotals {
  let subtotal = 0;
  let totalDiscount = 0;
  for (const it of items) {
    const lineHt = (Number(it.unit_price_ht) || 0) * (Number(it.qty) || 0);
    subtotal += lineHt;
    const pct = clampDiscountForItem(it);
    if (pct > 0) totalDiscount += lineHt * (pct / 100);
  }
  const discount = round2(totalDiscount);
  const totalHt = round2(subtotal - discount);
  const vat = round2(totalHt * (Math.max(0, Number(vatRate) || 0) / 100));
  const totalTtc = round2(totalHt + vat);
  return {
    subtotal_ht: round2(subtotal),
    discount_amount: discount,
    total_ht: totalHt,
    vat_amount: vat,
    total_ttc: totalTtc,
  };
}

/**
 * Prix unitaire HT remisé pour un item — utilisé pour pré-calculer le
 * `unit_amount` Sellsy quand on n'utilise pas le champ structuré row.discount.
 * (P6.x.5-ter on utilise row.discount, mais on garde l'helper pour debug.)
 */
export function discountedUnitPriceHt(item: QuoteItem): number {
  const pct = clampDiscountForItem(item);
  if (pct === 0) return round2(item.unit_price_ht);
  return round2(item.unit_price_ht * (1 - pct / 100));
}

/** Format français "12 500,00 €" (NBSP en séparateur de milliers + virgule). */
export function formatEurFr(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
