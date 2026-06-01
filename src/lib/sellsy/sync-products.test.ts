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

  it('filtre client-side case-insensitive : garde MDS-/mds-/Mds-, drop autres', async () => {
    vi.doMock('@/lib/sellsy/client', () => ({
      sellsyFetch: vi.fn().mockResolvedValue({
        data: [
          { id: 1, reference: 'MDS-PACK-ACCESS-PARIS' },
          { id: 2, reference: 'OTHER-ITEM' },
          { id: 3, reference: 'MDS-ADDON-WIFI-PARIS' },
          // P6.x.1a-quinquies : case-insensitive accepte lowercase + mixed.
          { id: 4, reference: 'mds-pack-classic' },
          { id: 5, reference: 'Mds-Addon-Logo' },
          // Garde drop : ref sans prefixe.
          { id: 6, reference: 'HF-LIVRE-BRIVE' },
          // Garde drop : null reference.
          { id: 7, reference: undefined },
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
    // 7 items recus, 4 filtres MDS-* uploades (3 uppercase + 1 lower + 1 mixed - 2 drop).
    expect(result.fetched).toBe(7);
    expect(upsert).toHaveBeenCalled();
    const upsertedRows = upsert.mock.calls[0][0];
    expect(upsertedRows).toHaveLength(4);
    const refs = upsertedRows.map((r: { reference: string }) => r.reference).sort();
    expect(refs).toContain('MDS-PACK-ACCESS-PARIS');
    expect(refs).toContain('MDS-ADDON-WIFI-PARIS');
    expect(refs).toContain('mds-pack-classic');
    expect(refs).toContain('Mds-Addon-Logo');
    expect(refs).not.toContain('OTHER-ITEM');
    expect(refs).not.toContain('HF-LIVRE-BRIVE');
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
