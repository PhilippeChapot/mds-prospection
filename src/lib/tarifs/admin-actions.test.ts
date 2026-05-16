/**
 * P6.x.1a — tests admin-actions module Tarifs.
 *
 * Validation :
 *   - upsert schema : Zod strict (category enum + types)
 *   - upsert action : non-admin → rejet
 *   - upsert action : INSERT/UPDATE upsert sur sellsy_product_id
 *   - delete action : DELETE par sellsy_product_id
 *   - bulkInitOther : insert seulement les produits sans ligne éditoriale
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

interface MockState {
  profile?: { id: string; role: 'admin' | 'sales' | 'viewer'; email: string } | null;
  upserts: Array<Record<string, unknown>>;
  deletesByPK: number[];
  inserts: Array<Record<string, unknown>>;
  existingSellsyIds?: number[];
  existingEditorialIds?: number[];
}

function mockEnv(state: MockState) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve(state.profile ?? { id: 'admin-1', role: 'admin', email: 'a@b' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = (_cols?: string) => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          // thenable for `await query`
          then: (resolve: (r: unknown) => void) => {
            if (table === 'sellsy_products_mirror') {
              resolve({
                data: (state.existingSellsyIds ?? []).map((id) => ({ sellsy_item_id: id })),
                error: null,
              });
              return;
            }
            if (table === 'tariff_editorial') {
              resolve({
                data: (state.existingEditorialIds ?? []).map((id) => ({ sellsy_product_id: id })),
                error: null,
              });
              return;
            }
            resolve({ data: [], error: null });
          },
        });
        builder.upsert = (payload: Record<string, unknown>) => {
          state.upserts.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'editorial-new' }, error: null }),
            }),
          };
        };
        builder.insert = (payload: unknown) => {
          if (Array.isArray(payload)) {
            for (const r of payload) state.inserts.push(r as Record<string, unknown>);
          } else {
            state.inserts.push(payload as Record<string, unknown>);
          }
          return Promise.resolve({ error: null });
        };
        builder.delete = () => ({
          eq: (_col: string, val: unknown) => {
            state.deletesByPK.push(Number(val));
            return Promise.resolve({ error: null });
          },
        });
        // eq filter on sellsy_products_mirror used by bulkInit (is_archived=false)
        const eqChain = () => ({
          eq: () => eqChain(),
          then: (resolve: (r: unknown) => void) => {
            if (table === 'sellsy_products_mirror') {
              resolve({
                data: (state.existingSellsyIds ?? []).map((id) => ({ sellsy_item_id: id })),
                error: null,
              });
            } else {
              resolve({ data: [], error: null });
            }
          },
        });
        const baseSelect = builder.select as (cols?: string) => Record<string, unknown>;
        builder.select = (cols?: string) => {
          const inner = baseSelect(cols);
          (inner as Record<string, unknown>).eq = () => eqChain();
          return inner;
        };
        return builder;
      },
    }),
  }));
}

function makeState(over: Partial<MockState> = {}): MockState {
  return { upserts: [], deletesByPK: [], inserts: [], ...over };
}

describe('admin-actions tarifs (P6.x.1a)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('upsertEditorialSchema', () => {
    it('accepts valid payload with defaults', async () => {
      const { upsertEditorialSchema } = await import('./admin-actions-schema');
      const parsed = upsertEditorialSchema.parse({
        sellsy_product_id: 1234,
        category: 'pack',
      });
      expect(parsed.display_order).toBe(9999);
      expect(parsed.featured).toBe(false);
      expect(parsed.is_visible_public).toBe(true);
      expect(parsed.tags).toEqual([]);
    });

    it('rejects invalid category enum value', async () => {
      const { upsertEditorialSchema } = await import('./admin-actions-schema');
      const result = upsertEditorialSchema.safeParse({
        sellsy_product_id: 1234,
        category: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative sellsy_product_id', async () => {
      const { upsertEditorialSchema } = await import('./admin-actions-schema');
      const result = upsertEditorialSchema.safeParse({
        sellsy_product_id: -1,
        category: 'pack',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('upsertEditorialAction', () => {
    it('rejects non-admin (sales role)', async () => {
      const state = makeState({
        profile: { id: 'u', role: 'sales', email: 's@x' },
      });
      mockEnv(state);
      const { upsertEditorialAction } = await import('./admin-actions');
      const result = await upsertEditorialAction({
        sellsy_product_id: 1234,
        category: 'pack',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/admin/i);
      expect(state.upserts).toHaveLength(0);
    });

    it('upserts on sellsy_product_id with normalized payload', async () => {
      const state = makeState();
      mockEnv(state);
      const { upsertEditorialAction } = await import('./admin-actions');
      const result = await upsertEditorialAction({
        sellsy_product_id: 5678,
        category: 'sponsor',
        sub_category: ' or ',
        display_order: 20,
        featured: true,
        editorial_title: 'Sponsor Or',
        tags: ['premium'],
      });
      expect(result.ok).toBe(true);
      expect(state.upserts).toHaveLength(1);
      expect(state.upserts[0].sellsy_product_id).toBe(5678);
      expect(state.upserts[0].category).toBe('sponsor');
      // sub_category trim-mé par Zod
      expect(state.upserts[0].sub_category).toBe('or');
      expect(state.upserts[0].featured).toBe(true);
      expect(state.upserts[0].tags).toEqual(['premium']);
    });
  });

  describe('deleteEditorialAction', () => {
    it('deletes by sellsy_product_id (admin only)', async () => {
      const state = makeState();
      mockEnv(state);
      const { deleteEditorialAction } = await import('./admin-actions');
      const result = await deleteEditorialAction({ sellsy_product_id: 9999 });
      expect(result.ok).toBe(true);
      expect(state.deletesByPK).toEqual([9999]);
    });
  });

  describe('bulkInitOtherAction', () => {
    it('only inserts products missing from tariff_editorial', async () => {
      const state = makeState({
        existingSellsyIds: [100, 101, 102],
        existingEditorialIds: [100], // 100 déjà tagué
      });
      mockEnv(state);
      const { bulkInitOtherAction } = await import('./admin-actions');
      const result = await bulkInitOtherAction();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.inserted).toBe(2); // 101 + 102
      }
      const ids = state.inserts.map((r) => r.sellsy_product_id).sort();
      expect(ids).toEqual([101, 102]);
      // tous insérés avec category='autre'
      for (const r of state.inserts) expect(r.category).toBe('autre');
    });

    it('inserts nothing when all products are already tagged', async () => {
      const state = makeState({
        existingSellsyIds: [200, 201],
        existingEditorialIds: [200, 201],
      });
      mockEnv(state);
      const { bulkInitOtherAction } = await import('./admin-actions');
      const result = await bulkInitOtherAction();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data?.inserted).toBe(0);
      expect(state.inserts).toHaveLength(0);
    });
  });
});
