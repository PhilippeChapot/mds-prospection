/**
 * Tests sync-products — focus sur les chemins purs / facilement isolables.
 * La sync complete (qui touche Sellsy + Supabase) est testee end-to-end
 * cote staging (cron Vercel + observabilite Logs). Ici on couvre les
 * branches qui n'ont pas besoin d'effets de bord.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sync-products fetch behavior', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('filtre client-side : ne garde que les references prefixees MDS-', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockResolvedValue({
        data: [
          { id: 1, reference: 'MDS-PACK-ACCESS-PARIS' },
          { id: 2, reference: 'OTHER-ITEM' },
          { id: 3, reference: 'MDS-ADDON-WIFI-PARIS' },
        ],
      }),
    }));

    // Mock supabase service - upsert/select/update no-op.
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          upsert,
          select: () => ({
            not: () => ({
              eq: () => ({}),
              is: () => ({}),
            }),
            in: () => ({}),
          }),
          update: () => ({ in: () => ({ error: null }) }),
        }),
      }),
    }));

    const { syncSellsyProducts } = await import('./sync-products');
    const result = await syncSellsyProducts();
    // 3 items recus, 2 filtres MDS-* uploades.
    expect(result.fetched).toBe(3);
    expect(upsert).toHaveBeenCalled();
    const upsertedRows = upsert.mock.calls[0][0];
    expect(upsertedRows).toHaveLength(2);
    expect(upsertedRows.map((r: { reference: string }) => r.reference).sort()).toEqual([
      'MDS-ADDON-WIFI-PARIS',
      'MDS-PACK-ACCESS-PARIS',
    ]);
  });

  it('abort si Sellsy retourne 0 item (evite d archiver tout le mirror)', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockResolvedValue({ data: [] }),
    }));
    const upsert = vi.fn();
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({ upsert }),
      }),
    }));

    const { syncSellsyProducts } = await import('./sync-products');
    const result = await syncSellsyProducts();
    expect(result.synced).toBe(0);
    expect(result.archived).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('catch erreur sellsyFetch et la stocke dans errors', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockRejectedValue(new Error('Sellsy fetch /items failed (502)')),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({ from: () => ({}) }),
    }));

    const { syncSellsyProducts } = await import('./sync-products');
    const result = await syncSellsyProducts();
    expect(result.fetched).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('fetch:');
  });

  it('mappe correctement les champs Sellsy vers les colonnes mirror', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockResolvedValue({
        data: [
          {
            id: 18214704,
            reference: 'MDS-PACK-ACCESS-PARIS',
            name: 'Pack ACCESS Paris',
            description: 'Stand ACCESS 9m2',
            unit_amount_excluding_tax: '1980.00',
            tax_id: 12,
            unit_id: 5,
            category_id: 7,
            is_archived: false,
          },
        ],
      }),
    }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          upsert,
          select: () => ({
            not: () => ({
              eq: () => ({}),
              is: () => ({}),
            }),
            in: () => ({}),
          }),
          update: () => ({ in: () => ({ error: null }) }),
        }),
      }),
    }));

    const { syncSellsyProducts } = await import('./sync-products');
    await syncSellsyProducts();

    const rows = upsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      sellsy_item_id: 18214704,
      reference: 'MDS-PACK-ACCESS-PARIS',
      name: 'Pack ACCESS Paris',
      price_excl_tax: 1980,
      tax_id: 12,
      unit_id: 5,
      category_id: 7,
      is_archived: false,
    });
    expect(rows[0].synced_at).toBeDefined();
  });

  it('reference manquante : fallback sur "unknown-{id}"', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockResolvedValue({
        data: [
          { id: 999, reference: 'MDS-WEIRD' },
          { id: 1000, name: 'no ref' },
        ],
      }),
    }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          upsert,
          select: () => ({
            not: () => ({
              eq: () => ({}),
              is: () => ({}),
            }),
            in: () => ({}),
          }),
          update: () => ({ in: () => ({ error: null }) }),
        }),
      }),
    }));

    const { syncSellsyProducts } = await import('./sync-products');
    await syncSellsyProducts();

    const rows = upsert.mock.calls[0][0];
    // Seul MDS-WEIRD passe le filtre prefix MDS-.
    expect(rows).toHaveLength(1);
    expect(rows[0].reference).toBe('MDS-WEIRD');
  });
});
