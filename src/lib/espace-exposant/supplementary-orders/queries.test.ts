/**
 * P6.x.1b-α — tests getOrderableCatalog + listSupplementaryOrdersForProspect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface CatalogRow {
  sellsy_product_id: number;
  category: 'pack' | 'sponsor' | 'option' | 'service' | 'autre';
  sub_category: string | null;
  editorial_title: string | null;
  tagline: string | null;
  description_md: string | null;
  image_url: string | null;
  display_order: number;
  featured: boolean;
  tags: string[];
  sellsy: {
    reference: string;
    name: string | null;
    price_excl_tax: number | null;
    is_archived: boolean;
  } | null;
}

interface OrderRow {
  id: string;
  status: string;
  total_ttc_eur: number;
  created_at: string;
  paid_at: string | null;
  sellsy_facture_number: string | null;
  items: unknown;
}

function mockSupabase(rows: { tariff?: CatalogRow[]; orders?: OrderRow[] } = {}) {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'tariff_editorial') {
          return {
            select: () => ({
              in: () => ({
                eq: () => Promise.resolve({ data: rows.tariff ?? [], error: null }),
              }),
            }),
          };
        }
        if (table === 'supplementary_orders') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: rows.orders ?? [], error: null }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));
}

describe('getOrderableCatalog (P6.x.1b)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns ordered catalog: featured first, then display_order, then name', async () => {
    mockSupabase({
      tariff: [
        {
          sellsy_product_id: 1,
          category: 'option',
          sub_category: 'wifi',
          editorial_title: null,
          tagline: null,
          description_md: null,
          image_url: null,
          display_order: 30,
          featured: false,
          tags: [],
          sellsy: { reference: 'MDS-WIFI', name: 'WiFi', price_excl_tax: 100, is_archived: false },
        },
        {
          sellsy_product_id: 2,
          category: 'sponsor',
          sub_category: 'or',
          editorial_title: null,
          tagline: null,
          description_md: null,
          image_url: null,
          display_order: 999,
          featured: true,
          tags: [],
          sellsy: {
            reference: 'MDS-SPONSOR-GOLD',
            name: 'Sponsor Or',
            price_excl_tax: 5000,
            is_archived: false,
          },
        },
        {
          sellsy_product_id: 3,
          category: 'option',
          sub_category: 'elec',
          editorial_title: null,
          tagline: null,
          description_md: null,
          image_url: null,
          display_order: 20,
          featured: false,
          tags: [],
          sellsy: {
            reference: 'MDS-ELEC',
            name: 'Électricité',
            price_excl_tax: 150,
            is_archived: false,
          },
        },
      ],
    });
    const { getOrderableCatalog } = await import('./queries');
    const result = await getOrderableCatalog();
    expect(result.map((p) => p.sellsy_product_id)).toEqual([2, 3, 1]);
    // Featured d'abord (id=2), puis display_order asc (3 before 1)
    expect(result[0]?.featured).toBe(true);
  });

  it('drops products with archived sellsy mirror', async () => {
    mockSupabase({
      tariff: [
        {
          sellsy_product_id: 1,
          category: 'option',
          sub_category: null,
          editorial_title: null,
          tagline: null,
          description_md: null,
          image_url: null,
          display_order: 10,
          featured: false,
          tags: [],
          sellsy: { reference: 'MDS-X', name: 'X', price_excl_tax: 100, is_archived: true },
        },
      ],
    });
    const { getOrderableCatalog } = await import('./queries');
    const result = await getOrderableCatalog();
    expect(result).toEqual([]);
  });

  it('drops products with null or invalid price', async () => {
    mockSupabase({
      tariff: [
        {
          sellsy_product_id: 1,
          category: 'service',
          sub_category: null,
          editorial_title: null,
          tagline: null,
          description_md: null,
          image_url: null,
          display_order: 10,
          featured: false,
          tags: [],
          sellsy: { reference: 'MDS-X', name: null, price_excl_tax: null, is_archived: false },
        },
      ],
    });
    const { getOrderableCatalog } = await import('./queries');
    const result = await getOrderableCatalog();
    expect(result).toEqual([]);
  });
});

describe('listSupplementaryOrdersForProspect (P6.x.1b)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('maps order rows + item_count from JSONB items array', async () => {
    mockSupabase({
      orders: [
        {
          id: 'order-1',
          status: 'paid',
          total_ttc_eur: 1200,
          created_at: '2026-05-16T10:00:00Z',
          paid_at: '2026-05-16T10:05:00Z',
          sellsy_facture_number: 'F-2026-001',
          items: [
            { sellsy_product_id: 1, qty: 1 },
            { sellsy_product_id: 2, qty: 3 },
          ],
        },
      ],
    });
    const { listSupplementaryOrdersForProspect } = await import('./queries');
    const result = await listSupplementaryOrdersForProspect('prospect-x');
    expect(result).toHaveLength(1);
    expect(result[0]?.item_count).toBe(2);
    expect(result[0]?.total_ttc_eur).toBe(1200);
    expect(result[0]?.sellsy_facture_number).toBe('F-2026-001');
  });
});
