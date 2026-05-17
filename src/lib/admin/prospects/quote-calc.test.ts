/**
 * @vitest-environment node
 *
 * P6.x.5 — tests pure functions de calcul Devis Builder.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateQuoteTotals,
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

describe('calculateQuoteTotals', () => {
  it('quote_items vide → totaux 0', () => {
    const t = calculateQuoteTotals([], 0, true, 20);
    expect(t).toEqual({
      subtotal_ht: 0,
      eligible_for_discount_ht: 0,
      discount_amount: 0,
      total_ht: 0,
      vat_amount: 0,
      total_ttc: 0,
    });
  });

  it('sous-total HT correct sans remise', () => {
    const t = calculateQuoteTotals([PACK_STD, SPONSOR], 0, true, 20);
    expect(t.subtotal_ht).toBe(15500);
    expect(t.discount_amount).toBe(0);
    expect(t.total_ht).toBe(15500);
    expect(t.vat_amount).toBe(3100);
    expect(t.total_ttc).toBe(18600);
  });

  it('remise -30% appliquée sur tous les items (pas de PREMIUM)', () => {
    const t = calculateQuoteTotals([PACK_STD, SPONSOR], 30, true, 20);
    expect(t.subtotal_ht).toBe(15500);
    expect(t.eligible_for_discount_ht).toBe(15500);
    expect(t.discount_amount).toBe(4650); // 15500 * 0.3
    expect(t.total_ht).toBe(10850);
    expect(t.vat_amount).toBe(2170);
    expect(t.total_ttc).toBe(13020);
  });

  it('remise -30% NOT appliquée sur PREMIUM si excludesPremium=true', () => {
    const t = calculateQuoteTotals([PACK_PREMIUM, SPONSOR], 30, true, 20);
    expect(t.subtotal_ht).toBe(28000);
    expect(t.eligible_for_discount_ht).toBe(3000); // seul SPONSOR éligible
    expect(t.discount_amount).toBe(900); // 3000 * 0.3
    expect(t.total_ht).toBe(27100);
  });

  it('remise -30% appliquée même sur PREMIUM si excludesPremium=false', () => {
    const t = calculateQuoteTotals([PACK_PREMIUM, SPONSOR], 30, false, 20);
    expect(t.eligible_for_discount_ht).toBe(28000);
    expect(t.discount_amount).toBe(8400);
    expect(t.total_ht).toBe(19600);
  });

  it('qty multiplie correctement les lignes', () => {
    const wifi = { ...SPONSOR, qty: 3, unit_price_ht: 240 };
    const t = calculateQuoteTotals([wifi], 0, true, 20);
    expect(t.subtotal_ht).toBe(720);
    expect(t.total_ttc).toBe(864);
  });

  it('TVA 0% (cas autoliquidation hypothétique) → total_ttc = total_ht', () => {
    const t = calculateQuoteTotals([PACK_STD], 0, true, 0);
    expect(t.total_ht).toBe(12500);
    expect(t.vat_amount).toBe(0);
    expect(t.total_ttc).toBe(12500);
  });

  it('promoPct hors bornes (négatif → 0, >100 → 100)', () => {
    const t1 = calculateQuoteTotals([PACK_STD], -10, true, 20);
    expect(t1.discount_amount).toBe(0);
    const t2 = calculateQuoteTotals([PACK_STD], 150, true, 20);
    expect(t2.discount_amount).toBe(12500); // clamped to 100% → discount=subtotal
    expect(t2.total_ht).toBe(0);
  });
});

describe('discountedUnitPriceHt', () => {
  it('promoPct=0 → prix plein', () => {
    expect(discountedUnitPriceHt(PACK_STD, 0, true)).toBe(12500);
  });
  it('promoPct=30 sur non-premium → prix remisé', () => {
    expect(discountedUnitPriceHt(PACK_STD, 30, true)).toBe(8750); // 12500 * 0.7
  });
  it('promoPct=30 sur PREMIUM avec exclusion → prix plein', () => {
    expect(discountedUnitPriceHt(PACK_PREMIUM, 30, true)).toBe(25000);
  });
  it('promoPct=30 sur PREMIUM sans exclusion → prix remisé', () => {
    expect(discountedUnitPriceHt(PACK_PREMIUM, 30, false)).toBe(17500);
  });
});
