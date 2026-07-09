import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assembleRows,
  createSellsyDocument,
  endpointForDocumentType,
  formatAmount,
  paymentPathToDocumentType,
} from './create-document';

describe('createSellsyDocument (type=proforma)', () => {
  it("refuse immédiatement — Sellsy V2 n'expose aucun endpoint de création de pro-forma, aucun appel DB/Sellsy", async () => {
    await expect(createSellsyDocument('any-prospect-id', 'proforma')).rejects.toThrow(
      /manuellement dans Sellsy/,
    );
  });
});

describe('paymentPathToDocumentType', () => {
  it('maps devis_sepa -> estimate', () => {
    expect(paymentPathToDocumentType('devis_sepa')).toBe('estimate');
  });

  it('maps devis_acompte_stripe -> estimate (devis avec acompte Stripe en M4)', () => {
    expect(paymentPathToDocumentType('devis_acompte_stripe')).toBe('estimate');
  });

  it('maps proforma_acompte -> proforma', () => {
    expect(paymentPathToDocumentType('proforma_acompte')).toBe('proforma');
  });

  it('maps facture_integrale -> invoice', () => {
    expect(paymentPathToDocumentType('facture_integrale')).toBe('invoice');
  });

  it('falls back to estimate for null / unknown', () => {
    expect(paymentPathToDocumentType(null)).toBe('estimate');
    expect(paymentPathToDocumentType(undefined)).toBe('estimate');
    expect(paymentPathToDocumentType('xxx')).toBe('estimate');
  });
});

describe('endpointForDocumentType', () => {
  it('routes type -> Sellsy V2 endpoint', () => {
    expect(endpointForDocumentType('estimate')).toBe('/estimates');
    expect(endpointForDocumentType('proforma')).toBe('/proformas');
    expect(endpointForDocumentType('invoice')).toBe('/invoices');
  });
});

describe('formatAmount (Sellsy V2 string format)', () => {
  it('formats integer EUR with 2 decimals', () => {
    expect(formatAmount(1980)).toBe('1980.00');
  });
  it('formats half-decimal correctly', () => {
    expect(formatAmount(1980.5)).toBe('1980.50');
  });
  it('formats arbitrary decimals (rounds to 2)', () => {
    expect(formatAmount(1980.567)).toBe('1980.57');
  });
  it('formats zero', () => {
    expect(formatAmount(0)).toBe('0.00');
  });
});

describe('assembleRows (Sellsy rows from resolved data)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('Paris seul : 1 row pack avec prix HT', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: false, supplementHt: 500, itemId: 99999 },
      addons: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      type: 'catalog',
      quantity: '1',
      related: { id: 18214704, type: 'product' },
      unit_amount: '1980.00',
    });
  });

  it('Paris + Marseille (item mappe) : 2 rows distinctes', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: true, supplementHt: 990, itemId: 18214800 },
      addons: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].related.id).toBe(18214704);
    expect(rows[0].unit_amount).toBe('1980.00');
    expect(rows[1].related.id).toBe(18214800);
    expect(rows[1].unit_amount).toBe('990.00');
  });

  it('Paris + Marseille avec sellsy_marseille_item_id null : 1 row + warning', () => {
    const warn = vi.spyOn(console, 'warn');
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: true, supplementHt: 990, itemId: null },
      addons: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].related.id).toBe(18214704);
    expect(warn).toHaveBeenCalled();
    const msg = warn.mock.calls[0]?.join(' ') ?? '';
    expect(msg).toContain('marseille-skipped');
    expect(msg).toContain('sellsy_marseille_item_id');
  });

  it('Paris + Marseille + 2 addons : 4 rows dans le bon ordre', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: true, supplementHt: 990, itemId: 18214800 },
      addons: [
        { itemId: 18214737, priceHt: 250 },
        { itemId: 18214738, priceHt: 350 },
      ],
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.related.id)).toEqual([18214704, 18214800, 18214737, 18214738]);
  });

  it('addons seuls (pack obligatoire mais sans Marseille) : 1 + N', () => {
    const rows = assembleRows({
      pack: { itemId: 18214704, priceHt: 1980 },
      marseille: { selected: false, supplementHt: null, itemId: null },
      addons: [{ itemId: 18214737, priceHt: 250 }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].unit_amount).toBe('250.00');
  });
});
