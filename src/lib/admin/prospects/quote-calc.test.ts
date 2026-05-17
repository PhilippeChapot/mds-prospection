/**
 * @vitest-environment node
 *
 * P6.x.5 / P6.x.5-ter — tests pure functions Devis Builder (remise par ligne).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateQuoteTotals,
  clampDiscountForItem,
  detectIsPremium,
  discountedUnitPriceHt,
  type QuoteItem,
} from './quote-calc';

const PACK_STD: QuoteItem = {
  sellsy_product_id: 1,
  reference: 'MDS-PACK-STD-ACCESS-PARIS',
  name: 'Pack ACCESS Standard',
  unit_price_ht: 12500,
  qty: 1,
  category: 'pack',
  sub_category: 'standard',
  is_premium: false,
  discount_pct: 0,
};
const PACK_PREMIUM: QuoteItem = {
  sellsy_product_id: 2,
  reference: 'MDS-PACK-PREMIUM-PARIS',
  name: 'Pack PREMIUM',
  unit_price_ht: 25000,
  qty: 1,
  category: 'pack',
  sub_category: 'premium',
  is_premium: true,
  discount_pct: 0,
};
const SPONSOR: QuoteItem = {
  sellsy_product_id: 3,
  reference: 'MDS-ADDON-LOGO-GOLD-PARIS',
  name: 'Logo Gold',
  unit_price_ht: 3000,
  qty: 1,
  category: 'sponsor',
  sub_category: 'or',
  is_premium: false,
  discount_pct: 0,
};

describe('detectIsPremium', () => {
  it('détecte via sub_category=premium', () => {
    expect(detectIsPremium({ sub_category: 'premium', reference: 'X' })).toBe(true);
    expect(detectIsPremium({ sub_category: 'PREMIUM', reference: 'X' })).toBe(true);
  });
  it('détecte via regex référence MDS-PACK-PREMIUM-*', () => {
    expect(
      detectIsPremium({ sub_category: 'something_else', reference: 'MDS-PACK-PREMIUM-PARIS' }),
    ).toBe(true);
    expect(detectIsPremium({ sub_category: null, reference: 'MDS-PACK-PREMIUM-MARSEILLE' })).toBe(
      true,
    );
  });
  it('renvoie false sinon', () => {
    expect(detectIsPremium({ sub_category: 'standard', reference: 'MDS-PACK-STD' })).toBe(false);
    expect(detectIsPremium({ sub_category: null, reference: 'MDS-ADDON-LOGO' })).toBe(false);
  });
});

describe('clampDiscountForItem (P6.x.5-ter)', () => {
  it('PREMIUM toujours 0, même si discount_pct = 50', () => {
    expect(clampDiscountForItem({ is_premium: true, discount_pct: 50 })).toBe(0);
  });
  it('non-premium : borne [0, 100]', () => {
    expect(clampDiscountForItem({ is_premium: false, discount_pct: -5 })).toBe(0);
    expect(clampDiscountForItem({ is_premium: false, discount_pct: 30 })).toBe(30);
    expect(clampDiscountForItem({ is_premium: false, discount_pct: 150 })).toBe(100);
    expect(clampDiscountForItem({ is_premium: false, discount_pct: null })).toBe(0);
  });
});

describe('calculateQuoteTotals (P6.x.5-ter, remise par ligne)', () => {
  it('quote_items vide → totaux 0', () => {
    expect(calculateQuoteTotals([], 20)).toEqual({
      subtotal_ht: 0,
      discount_amount: 0,
      total_ht: 0,
      vat_amount: 0,
      total_ttc: 0,
    });
  });

  it('items sans remise → sous-total = total HT', () => {
    const t = calculateQuoteTotals([PACK_STD, SPONSOR], 20);
    expect(t.subtotal_ht).toBe(15500);
    expect(t.discount_amount).toBe(0);
    expect(t.total_ht).toBe(15500);
    expect(t.total_ttc).toBe(18600);
  });

  it('remises ligne par ligne cumulées (différents % par item)', () => {
    const t = calculateQuoteTotals(
      [
        { ...PACK_STD, discount_pct: 30 }, // 12500 * 0.3 = 3750
        { ...SPONSOR, discount_pct: 10 }, // 3000 * 0.1 = 300
      ],
      20,
    );
    expect(t.subtotal_ht).toBe(15500);
    expect(t.discount_amount).toBe(4050); // 3750 + 300
    expect(t.total_ht).toBe(11450);
    expect(t.vat_amount).toBe(2290);
    expect(t.total_ttc).toBe(13740);
  });

  it('PREMIUM avec discount_pct=50 → forcé à 0 par clamp (jamais bradé)', () => {
    const t = calculateQuoteTotals([{ ...PACK_PREMIUM, discount_pct: 50 }, SPONSOR], 20);
    expect(t.subtotal_ht).toBe(28000);
    expect(t.discount_amount).toBe(0); // PREMIUM forcé à 0, SPONSOR à 0
    expect(t.total_ht).toBe(28000);
  });

  it('PREMIUM forcé 0 mais autres items remisés normalement', () => {
    const t = calculateQuoteTotals(
      [
        { ...PACK_PREMIUM, discount_pct: 100 }, // ignoré
        { ...SPONSOR, discount_pct: 20 }, // 3000 * 0.2 = 600
      ],
      20,
    );
    expect(t.discount_amount).toBe(600);
    expect(t.total_ht).toBe(27400);
  });

  it('qty multiplie ligne + remise', () => {
    const t = calculateQuoteTotals(
      [{ ...SPONSOR, qty: 3, unit_price_ht: 240, discount_pct: 50 }],
      20,
    );
    // ligne HT = 720, remise 50% = 360, total HT = 360
    expect(t.subtotal_ht).toBe(720);
    expect(t.discount_amount).toBe(360);
    expect(t.total_ht).toBe(360);
  });

  it('discount_pct hors bornes clampé', () => {
    const t = calculateQuoteTotals([{ ...PACK_STD, discount_pct: 150 }], 20);
    // clampé à 100% → discount=12500, total=0
    expect(t.discount_amount).toBe(12500);
    expect(t.total_ht).toBe(0);
  });
});

describe('discountedUnitPriceHt (P6.x.5-ter)', () => {
  it('discount_pct=0 → prix plein', () => {
    expect(discountedUnitPriceHt(PACK_STD)).toBe(12500);
  });
  it('non-premium avec discount_pct=30 → prix remisé', () => {
    expect(discountedUnitPriceHt({ ...PACK_STD, discount_pct: 30 })).toBe(8750);
  });
  it('PREMIUM avec discount_pct=30 → prix plein (clamp)', () => {
    expect(discountedUnitPriceHt({ ...PACK_PREMIUM, discount_pct: 30 })).toBe(25000);
  });
});
