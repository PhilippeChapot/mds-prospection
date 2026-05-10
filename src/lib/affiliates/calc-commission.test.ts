import { describe, it, expect } from 'vitest';
import { calculateCommission } from './calc-commission';

describe('calculateCommission (P5.x.7)', () => {
  it('FR standard : TTC 9156 € (= 7630 HT) × 10% = 763 €', () => {
    const result = calculateCommission({
      totalSellsyAmount: 9156,
      isAutoliquidation: false,
      commissionPercent: 10,
    });
    expect(result.baseHt).toBe(7630);
    expect(result.commissionEurHt).toBe(763);
  });

  it('autoliquidation UE : 7630 € HT direct × 10% = 763 €', () => {
    const result = calculateCommission({
      totalSellsyAmount: 7630,
      isAutoliquidation: true,
      commissionPercent: 10,
    });
    expect(result.baseHt).toBe(7630);
    expect(result.commissionEurHt).toBe(763);
  });

  it('rate 5% (commission_percent reduit) : 7630 × 5% = 381.5 €', () => {
    const result = calculateCommission({
      totalSellsyAmount: 7630,
      isAutoliquidation: true,
      commissionPercent: 5,
    });
    expect(result.commissionEurHt).toBe(381.5);
  });

  it('rate 12.5% : arrondi 2 decimales', () => {
    const result = calculateCommission({
      totalSellsyAmount: 7630,
      isAutoliquidation: true,
      commissionPercent: 12.5,
    });
    expect(result.commissionEurHt).toBe(953.75);
  });

  it('totalSellsyAmount <= 0 -> 0', () => {
    expect(
      calculateCommission({
        totalSellsyAmount: 0,
        isAutoliquidation: false,
        commissionPercent: 10,
      }),
    ).toEqual({ baseHt: 0, commissionEurHt: 0 });
    expect(
      calculateCommission({
        totalSellsyAmount: -100,
        isAutoliquidation: false,
        commissionPercent: 10,
      }),
    ).toEqual({ baseHt: 0, commissionEurHt: 0 });
  });

  it('commissionPercent <= 0 -> 0', () => {
    expect(
      calculateCommission({
        totalSellsyAmount: 9156,
        isAutoliquidation: false,
        commissionPercent: 0,
      }),
    ).toEqual({ baseHt: 0, commissionEurHt: 0 });
  });

  it('NaN / Infinity -> 0 (defensif)', () => {
    expect(
      calculateCommission({
        totalSellsyAmount: NaN,
        isAutoliquidation: false,
        commissionPercent: 10,
      }),
    ).toEqual({ baseHt: 0, commissionEurHt: 0 });
    expect(
      calculateCommission({
        totalSellsyAmount: 9156,
        isAutoliquidation: false,
        commissionPercent: Infinity,
      }),
    ).toEqual({ baseHt: 0, commissionEurHt: 0 });
  });

  it('commissionPercent stocke en numeric(5,2) : 10.00 -> result identique a 10', () => {
    const r1 = calculateCommission({
      totalSellsyAmount: 9156,
      isAutoliquidation: false,
      commissionPercent: 10,
    });
    const r2 = calculateCommission({
      totalSellsyAmount: 9156,
      isAutoliquidation: false,
      commissionPercent: 10.0,
    });
    expect(r1).toEqual(r2);
  });
});
