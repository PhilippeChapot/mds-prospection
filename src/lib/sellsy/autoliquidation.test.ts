import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assembleRows } from './create-document';

describe('assembleRows + autoliquidation TVA (P4 M7)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sans taxIdOverride : aucun tax_id sur les rows (catalog default 20%)', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: false, supplementHt: null, itemId: null },
      addons: [{ itemId: 18214737, priceHt: 250 }],
    });
    expect(rows.every((r) => r.tax_id === undefined)).toBe(true);
  });

  it('avec taxIdOverride=999 : tax_id=999 applique sur toutes les rows', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: true, supplementHt: 990, itemId: 18214800 },
      addons: [{ itemId: 18214737, priceHt: 250 }],
      taxIdOverride: 999,
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tax_id === 999)).toBe(true);
  });

  it('taxIdOverride=null : equivalent a undefined (pas d override)', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: false, supplementHt: null, itemId: null },
      addons: [],
      taxIdOverride: null,
    });
    expect(rows[0].tax_id).toBeUndefined();
  });
});
