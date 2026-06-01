/**
 * @vitest-environment node
 *
 * P6.x.1a-quinquies — verifie que listProductsWithEditorial applique
 * le filtre ILIKE 'MDS-%' (defense in depth) sur la query.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  ilikeCalls: [] as Array<{ col: string; pattern: string }>,
};

function makeClient() {
  return {
    from: (table: string) => {
      let chain: Record<string, unknown> = {};
      chain = {
        select: () => chain,
        ilike: (col: string, pattern: string) => {
          state.ilikeCalls.push({ col, pattern });
          return chain;
        },
        order: () => chain,
        eq: () => chain,
        or: () => chain,
        then: (cb: (v: { data: unknown[]; error: null }) => unknown) => {
          if (table === 'sellsy_products_mirror') {
            return Promise.resolve({ data: [], error: null }).then(cb);
          }
          return Promise.resolve({ data: [], error: null }).then(cb);
        },
      };
      return chain;
    },
  };
}

describe('listProductsWithEditorial filter MDS- (P6.x.1a-quinquies)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.ilikeCalls = [];
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: async () => makeClient(),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("applique ilike('reference', 'MDS-%')", async () => {
    const { listProductsWithEditorial } = await import('./admin-queries');
    await listProductsWithEditorial();
    const mdsCall = state.ilikeCalls.find((c) => c.col === 'reference' && c.pattern === 'MDS-%');
    expect(mdsCall).toBeTruthy();
  });
});
