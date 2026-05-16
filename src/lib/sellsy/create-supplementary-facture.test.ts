/**
 * P6.x.1b-β — tests createSupplementaryFacture.
 *
 * Mocke sellsyFetch pour vérifier le payload envoyé + le parsing de la réponse.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/sellsy/client', () => ({
  sellsyFetch: vi.fn(),
}));

describe('createSupplementaryFacture (P6.x.1b-β)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuses empty items', async () => {
    const { createSupplementaryFacture } = await import('./create-supplementary-facture');
    const result = await createSupplementaryFacture({
      orderId: 'order-1',
      companysSellsyId: 42,
      items: [],
    });
    expect(result.ok).toBe(false);
  });

  it('refuses invalid sellsy company id', async () => {
    const { createSupplementaryFacture } = await import('./create-supplementary-facture');
    const result = await createSupplementaryFacture({
      orderId: 'order-1',
      companysSellsyId: 0,
      items: [
        {
          sellsy_product_id: 1,
          reference: 'X',
          name: 'X',
          unit_price_ht: 100,
          qty: 1,
          line_total_ht: 100,
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('sends correct payload to /invoices and parses response', async () => {
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    const mockFetch = sellsyFetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      id: 999,
      number: 'F-2026-001',
      public_link: 'https://sellsy.com/invoice/999',
    });

    const { createSupplementaryFacture } = await import('./create-supplementary-facture');
    const result = await createSupplementaryFacture({
      orderId: 'order-abc',
      companysSellsyId: 1234,
      items: [
        {
          sellsy_product_id: 100,
          reference: 'MDS-ADDON-WIFI',
          name: 'WiFi',
          unit_price_ht: 50,
          qty: 2,
          line_total_ht: 100,
        },
        {
          sellsy_product_id: 200,
          reference: 'MDS-ADDON-LOGO-GOLD',
          name: 'Sponsor Or',
          unit_price_ht: 5000,
          qty: 1,
          line_total_ht: 5000,
        },
      ],
      label: 'Test label',
    });
    expect(result.ok).toBe(true);
    expect(result.facture_id).toBe(999);
    expect(result.facture_number).toBe('F-2026-001');
    expect(result.facture_public_url).toBe('https://sellsy.com/invoice/999');

    // Vérification du payload envoyé à /invoices
    expect(mockFetch).toHaveBeenCalledWith(
      '/invoices',
      expect.objectContaining({ method: 'POST' }),
    );
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.related).toEqual([{ type: 'company', id: 1234 }]);
    expect(body.public_link_enabled).toBe(true);
    expect(body.reference).toBe('Test label');
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toEqual({
      type: 'catalog',
      quantity: '2.00',
      related: { id: 100, type: 'product' },
      unit_amount: '50.00',
    });
    expect(body.rows[1].unit_amount).toBe('5000.00');
  });

  it('returns ok=false when Sellsy throws', async () => {
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    const mockFetch = sellsyFetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error('Sellsy 500 internal'));

    const { createSupplementaryFacture } = await import('./create-supplementary-facture');
    const result = await createSupplementaryFacture({
      orderId: 'order-x',
      companysSellsyId: 42,
      items: [
        {
          sellsy_product_id: 1,
          reference: 'X',
          name: 'X',
          unit_price_ht: 100,
          qty: 1,
          line_total_ht: 100,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Sellsy 500/);
  });

  it('returns ok=false when Sellsy response has no id', async () => {
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    const mockFetch = sellsyFetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({ status: 'created' }); // pas d'id

    const { createSupplementaryFacture } = await import('./create-supplementary-facture');
    const result = await createSupplementaryFacture({
      orderId: 'order-x',
      companysSellsyId: 42,
      items: [
        {
          sellsy_product_id: 1,
          reference: 'X',
          name: 'X',
          unit_price_ht: 100,
          qty: 1,
          line_total_ht: 100,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/id/);
  });
});
