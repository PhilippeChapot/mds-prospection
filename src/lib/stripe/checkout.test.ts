import { describe, it, expect } from 'vitest';
import { computeCheckoutAmountCents, buildCheckoutLineName } from './checkout';

describe('computeCheckoutAmountCents', () => {
  it('calcule acompte 30% en centimes', () => {
    expect(computeCheckoutAmountCents(10000, 'acompte_30pct')).toBe(300000);
  });

  it('calcule paiement integral TTC (HT*1.20) en centimes', () => {
    expect(computeCheckoutAmountCents(10000, 'integral')).toBe(1200000);
  });

  it("arrondit l'acompte sur des montants a virgule", () => {
    // 1980 HT * 0.30 = 594 EUR -> 59400 cents
    expect(computeCheckoutAmountCents(1980, 'acompte_30pct')).toBe(59400);
    // 1234.56 HT * 0.30 = 370.368 EUR -> arrondi a 37037 cents
    expect(computeCheckoutAmountCents(1234.56, 'acompte_30pct')).toBe(37037);
  });
});

describe('buildCheckoutLineName', () => {
  it('inclut le numero de devis pour acompte', () => {
    expect(buildCheckoutLineName('acompte_30pct', 'D-20260505-02689')).toBe(
      'Acompte 30% — D-20260505-02689',
    );
  });

  it('inclut le numero de devis pour integral', () => {
    expect(buildCheckoutLineName('integral', 'D-20260505-02689')).toBe(
      'Paiement intégral — D-20260505-02689',
    );
  });

  it("fallback 'devis MDS' si numero manquant", () => {
    expect(buildCheckoutLineName('acompte_30pct', null)).toBe('Acompte 30% — devis MDS');
  });
});
