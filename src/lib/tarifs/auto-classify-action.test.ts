/**
 * P6.x.1a-quater — tests autoClassifyAllAction.
 *
 * Mock plus complet : produits Sellsy avec références réelles + lignes
 * tariff_editorial existantes. Vérifie le flow dry_run, override, unmatched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

interface MockProduct {
  sellsy_item_id: number;
  reference: string;
  name: string | null;
}
interface MockEditorial {
  sellsy_product_id: number;
  category: string;
  sub_category: string | null;
}

interface State {
  profile?: { id: string; role: 'admin' | 'sales' | 'viewer'; email: string } | null;
  products: MockProduct[];
  editorials: MockEditorial[];
  inserts: Array<{ table: string; payload: unknown }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; filter: string }>;
}

function mockEnv(state: State) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve(state.profile ?? { id: 'admin-1', role: 'admin', email: 'a@b' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        // .select(...).eq(col, val) → thenable resolving to filtered list
        builder.select = (_cols?: string) => {
          const ctx = { is_archived: undefined as boolean | undefined };
          const eqChain = (col: string, val: unknown) => {
            if (table === 'sellsy_products_mirror' && col === 'is_archived') {
              ctx.is_archived = val as boolean;
            }
            return chain;
          };
          const chain = {
            eq: eqChain,
            then: (resolve: (r: unknown) => void) => {
              if (table === 'sellsy_products_mirror') {
                resolve({ data: state.products, error: null });
              } else if (table === 'tariff_editorial') {
                resolve({ data: state.editorials, error: null });
              } else {
                resolve({ data: [], error: null });
              }
            },
          };
          return chain;
        };
        builder.insert = (payload: unknown) => {
          state.inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        };
        builder.update = (patch: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            state.updates.push({ table, patch, filter: `${col}=${val}` });
            return Promise.resolve({ error: null });
          },
        });
        return builder;
      },
    }),
  }));
}

const REAL_PRODUCTS: MockProduct[] = [
  { sellsy_item_id: 1, reference: 'MDS-PACK-STD-ACCESS-PARIS', name: 'Pack ACCESS Std' },
  { sellsy_item_id: 2, reference: 'MDS-ADDON-LOGO-GOLD-PARIS', name: 'Sponsor Or' },
  { sellsy_item_id: 3, reference: 'MDS-ADDON-WIRED-2MBPS-PARIS', name: 'Internet 2 Mbps' },
  { sellsy_item_id: 4, reference: 'MDS-ADDON-EMAIL-BLAST-CONNECTONAIR-PARIS', name: 'Emailing' },
  { sellsy_item_id: 99, reference: 'UNKNOWN-MYSTERY-SKU', name: 'Unknown product' },
];

function makeState(over: Partial<State> = {}): State {
  return {
    products: REAL_PRODUCTS,
    editorials: [],
    inserts: [],
    updates: [],
    ...over,
  };
}

describe('autoClassifyAllAction (P6.x.1a-quater)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects non-admin (sales role)', async () => {
    const state = makeState({ profile: { id: 'u', role: 'sales', email: 's@x' } });
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin/i);
  });

  it('dry_run=true returns preview without DB writes', async () => {
    const state = makeState();
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: true });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.dry_run).toBe(true);
      expect(result.data.classified).toBe(4); // 4 matchent (pas l'UNKNOWN)
      expect(result.data.unmatched).toBe(1);
      expect(result.data.preview).toHaveLength(4);
    }
    // Aucun write DB
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('dry_run=false applies INSERTs for products without editorial row', async () => {
    const state = makeState(); // editorials vide
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: false });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) expect(result.data.classified).toBe(4);
    // 1 batch INSERT contenant 4 rows
    const insertCall = state.inserts.find((i) => i.table === 'tariff_editorial');
    expect(insertCall).toBeDefined();
    const payload = insertCall?.payload as Array<{ sellsy_product_id: number; category: string }>;
    expect(payload).toHaveLength(4);
    const ids = payload.map((r) => r.sellsy_product_id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('skips products already classified manually (non-autre) when override=false', async () => {
    const state = makeState({
      editorials: [
        { sellsy_product_id: 1, category: 'pack', sub_category: 'manual_override' },
        { sellsy_product_id: 2, category: 'autre', sub_category: null }, // bulk-init → re-classifié
      ],
    });
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: true, override_existing: false });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.skipped).toBe(1); // product 1 (pack manuel)
      expect(result.data.classified).toBe(3); // 2 (autre→sponsor) + 3 + 4
    }
  });

  it('override_existing=true re-classifies all matched (including manuals)', async () => {
    const state = makeState({
      editorials: [
        { sellsy_product_id: 1, category: 'pack', sub_category: 'manual_override' },
        { sellsy_product_id: 2, category: 'autre', sub_category: null },
      ],
    });
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: true, override_existing: true });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.skipped).toBe(0);
      expect(result.data.classified).toBe(4);
    }
  });

  it('dry_run=false with existing rows uses UPDATE not INSERT', async () => {
    const state = makeState({
      editorials: [
        { sellsy_product_id: 1, category: 'autre', sub_category: null }, // existant → UPDATE
        // 2, 3, 4 sans editorial → INSERT
      ],
    });
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: false });
    expect(result.ok).toBe(true);

    // 1 UPDATE pour le sellsy_product_id=1 (sa catégorie était 'autre')
    const update1 = state.updates.find(
      (u) => u.table === 'tariff_editorial' && u.filter === 'sellsy_product_id=1',
    );
    expect(update1).toBeDefined();
    expect(update1?.patch.category).toBe('pack');
    expect(update1?.patch.sub_category).toBe('standard');

    // INSERT batch contient 2, 3, 4
    const insertCall = state.inserts.find((i) => i.table === 'tariff_editorial');
    expect(insertCall).toBeDefined();
    const payload = insertCall?.payload as Array<{ sellsy_product_id: number }>;
    const ids = payload.map((r) => r.sellsy_product_id).sort((a, b) => a - b);
    expect(ids).toEqual([2, 3, 4]);
  });

  it('counts unmatched products separately', async () => {
    const state = makeState({
      products: [
        { sellsy_item_id: 99, reference: 'FOO-BAR-NONE', name: 'Mystery' },
        { sellsy_item_id: 100, reference: 'BAZ-QUX', name: 'Mystery 2' },
      ],
    });
    mockEnv(state);
    const { autoClassifyAllAction } = await import('./admin-actions');
    const result = await autoClassifyAllAction({ dry_run: true });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.unmatched).toBe(2);
      expect(result.data.classified).toBe(0);
      expect(result.data.preview).toHaveLength(0);
    }
  });
});
