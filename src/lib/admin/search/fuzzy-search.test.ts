/**
 * @vitest-environment node
 *
 * P5.x.SearchFuzzy — tests fuzzy-search helpers.
 *
 * On mock le client Supabase pour eviter dependance DB locale. La logique
 * SQL RPC est testee indirectement (vrai integration test = manuel sur
 * staging apres pnpm db:push).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  rpcRows: [] as Array<Record<string, unknown>>,
  rpcError: null as { message: string } | null,
  lastRpcName: null as string | null,
  lastRpcArgs: null as Record<string, unknown> | null,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: vi.fn(async () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        state.lastRpcName = name;
        state.lastRpcArgs = args;
        return Promise.resolve({
          data: state.rpcError ? null : state.rpcRows,
          error: state.rpcError,
        });
      },
    })),
  }));
}

function reset() {
  state.rpcRows = [];
  state.rpcError = null;
  state.lastRpcName = null;
  state.lastRpcArgs = null;
}

describe('searchCompaniesFuzzy (P5.x.SearchFuzzy)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Query < 2 chars → retourne vide sans RPC call', async () => {
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    const r = await searchCompaniesFuzzy('a');
    expect(r.exact).toEqual([]);
    expect(r.suggestions).toEqual([]);
    expect(state.lastRpcName).toBeNull(); // pas d appel RPC
  });

  it('Trim le query : "  ab  " → query "ab"', async () => {
    state.rpcRows = [];
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    const r = await searchCompaniesFuzzy('  ab  ');
    expect(r.query).toBe('ab');
    expect(state.lastRpcArgs?.p_query).toBe('ab');
  });

  it('Split exact + fuzzy via match_type', async () => {
    state.rpcRows = [
      { id: 'c1', name: 'Mediarun', match_type: 'exact', score: 1.0 },
      { id: 'c2', name: 'Mediastock', match_type: 'fuzzy', score: 0.55 },
      { id: 'c3', name: 'Media Speak', match_type: 'fuzzy', score: 0.5 },
    ];
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    const r = await searchCompaniesFuzzy('mediarun');
    expect(r.exact).toHaveLength(1);
    expect(r.exact[0].label).toBe('Mediarun');
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions.map((s) => s.label)).toEqual(['Mediastock', 'Media Speak']);
  });

  it('Dedup suggestions par label normalise', async () => {
    state.rpcRows = [
      { id: 'c1', name: 'Mediarun', match_type: 'fuzzy', score: 0.5 },
      { id: 'c2', name: 'mediarun', match_type: 'fuzzy', score: 0.5 }, // dup case
      { id: 'c3', name: 'Mediarun ', match_type: 'fuzzy', score: 0.4 }, // dup whitespace
    ];
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    const r = await searchCompaniesFuzzy('mediarun');
    expect(r.suggestions).toHaveLength(1);
  });

  it('Forward limits a la RPC', async () => {
    state.rpcRows = [];
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    await searchCompaniesFuzzy('mediarun', { limitExact: 20, limitFuzzy: 10 });
    expect(state.lastRpcArgs).toEqual({
      p_query: 'mediarun',
      p_limit_exact: 20,
      p_limit_fuzzy: 10,
    });
  });

  it('Error RPC → return empty mais ne throw pas', async () => {
    state.rpcError = { message: 'function does not exist' };
    mockEnv();
    const { searchCompaniesFuzzy } = await import('./fuzzy-search');
    const r = await searchCompaniesFuzzy('mediarun');
    expect(r.exact).toEqual([]);
    expect(r.suggestions).toEqual([]);
  });
});

describe('searchContactsFuzzy (P5.x.SearchFuzzy)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Label = "first_name last_name" si dispo, fallback email', async () => {
    state.rpcRows = [
      {
        id: 'u1',
        email: 'lchollet@20minutes.fr',
        first_name: 'Lucie',
        last_name: 'Chollet',
        match_type: 'exact',
        score: 1.0,
      },
      {
        id: 'u2',
        email: 'noname@example.com',
        first_name: null,
        last_name: null,
        match_type: 'fuzzy',
        score: 0.55,
      },
    ];
    mockEnv();
    const { searchContactsFuzzy } = await import('./fuzzy-search');
    const r = await searchContactsFuzzy('chollet');
    expect(r.exact[0].label).toBe('Lucie Chollet');
    expect(r.suggestions[0].label).toBe('noname@example.com');
  });
});

describe('searchProspectsFuzzy (P5.x.SearchFuzzy)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Label = company_name (join via RPC)', async () => {
    state.rpcRows = [
      {
        id: 'p1',
        company_id: 'co1',
        company_name: 'Acme Radio',
        match_type: 'exact',
        score: 1.0,
      },
    ];
    mockEnv();
    const { searchProspectsFuzzy } = await import('./fuzzy-search');
    const r = await searchProspectsFuzzy('acme');
    expect(r.exact[0].label).toBe('Acme Radio');
  });
});
