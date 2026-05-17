/**
 * P6.x.5 — calculs pure du Devis Builder.
 *
 * Pure functions sans accès DB ni Sellsy : utilisées à la fois par
 *   - l'UI live recap (QuoteRecap.tsx)
 *   - la server action saveQuoteDraftAction (hydrate estimated_amount)
 *   - l'émission Sellsy (applique unit_amount remisé par row)
 *
 * Doctrine PREMIUM :
 *   - Un item est `is_premium` si :
 *     1. sub_category === 'premium' (source de vérité tariff_editorial)
 *     2. OU sa référence Sellsy commence par MDS-PACK-PREMIUM-
 *   - Si `promo_excludes_premium` est true (défaut), les items PREMIUM ne
 *     reçoivent JAMAIS la remise (doctrine business).
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
}

export interface QuoteTotals {
  subtotal_ht: number;
  eligible_for_discount_ht: number;
  discount_amount: number;
  total_ht: number;
  vat_amount: number;
  total_ttc: number;
}

/** Détecte si un item Sellsy/tariff est PREMIUM (doctrine : sub_category ou regex référence). */
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

/**
 * Arrondi à 2 décimales — évite les soucis de virgules flottantes
 * (12.500000000000004) qui peuvent diverger entre Sellsy et notre récap.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcule tous les totaux du devis à partir des items + config promo + vatRate.
 *
 * @param vatRate 20 pour 20%, etc.
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  promoPct: number,
  promoExcludesPremium: boolean,
  vatRate: number,
): QuoteTotals {
  let subtotal = 0;
  let eligible = 0;
  for (const it of items) {
    const lineHt = (Number(it.unit_price_ht) || 0) * (Number(it.qty) || 0);
    subtotal += lineHt;
    if (!promoExcludesPremium || !it.is_premium) {
      eligible += lineHt;
    }
  }
  const safePct = Math.max(0, Math.min(100, Number(promoPct) || 0));
  const discount = round2(eligible * (safePct / 100));
  const totalHt = round2(subtotal - discount);
  const vat = round2(totalHt * (Math.max(0, Number(vatRate) || 0) / 100));
  const totalTtc = round2(totalHt + vat);
  return {
    subtotal_ht: round2(subtotal),
    eligible_for_discount_ht: round2(eligible),
    discount_amount: discount,
    total_ht: totalHt,
    vat_amount: vat,
    total_ttc: totalTtc,
  };
}

/**
 * Calcule le prix unitaire remisé pour un item donné (utilisé par l'émission
 * Sellsy pour poser `unit_amount` sur chaque row, plutôt que d'utiliser
 * le champ `discount` côté Sellsy V2 qui a des quirks).
 *
 * @returns prix unitaire HT remisé (2 décimales)
 */
export function discountedUnitPriceHt(
  item: QuoteItem,
  promoPct: number,
  promoExcludesPremium: boolean,
): number {
  const safePct = Math.max(0, Math.min(100, Number(promoPct) || 0));
  if (safePct === 0) return round2(item.unit_price_ht);
  if (promoExcludesPremium && item.is_premium) return round2(item.unit_price_ht);
  return round2(item.unit_price_ht * (1 - safePct / 100));
}

/** Format français "12 500,00 €" (NBSP en séparateur de milliers + décimale virgule). */
export function formatEurFr(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
