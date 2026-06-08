/**
 * @vitest-environment node
 *
 * P6.x.SellsyDedupClient — tests server actions link / unlink / search.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;

const state = {
  company: null as Row | null,
  prospects: [] as Row[],
  updates: [] as Array<{ table: string; values: Row }>,
  inserts: [] as Array<{ table: string; values: Row }>,
  profile: { id: 'admin-1', role: 'admin' as const } as { id: string; role: string },
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('next/cache', () => ({
    revalidatePath: vi.fn(),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from(table: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => {
            if (table === 'companies') return { data: state.company };
            return { data: null };
          },
          update: (values: Row) => ({
            eq: async () => {
              state.updates.push({ table, values });
              return { error: null };
            },
          }),
          insert: async (values: Row) => {
            state.inserts.push({ table, values });
            return { error: null };
          },
          then: (fn: (v: { data: Row[] }) => unknown) => {
            if (table === 'prospects') return Promise.resolve({ data: state.prospects }).then(fn);
            return Promise.resolve({ data: [] }).then(fn);
          },
        };
        return chain;
      },
    }),
  }));
  vi.doMock('@/lib/sellsy/client', () => ({
    sellsyFetch: vi.fn(),
    SellsyError: class extends Error {
      status = 400;
      body: unknown = {};
    },
  }));
}

function reset() {
  state.company = null;
  state.prospects = [];
  state.updates = [];
  state.inserts = [];
  state.profile = { id: 'admin-1', role: 'admin' };
}

describe('linkCompanyToSellsyClientAction (P6.x.SellsyDedupClient)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Update companies.sellsy_id + audit_log company-level + prospect-level', async () => {
    state.company = { sellsy_id: null };
    state.prospects = [{ id: 'p1' }, { id: 'p2' }];
    mockEnv();
    const { linkCompanyToSellsyClientAction } = await import('./sellsy-link-actions');
    const r = await linkCompanyToSellsyClientAction({
      company_id: '8c5e2a3f-4b1d-4cdf-9c5e-1a2b3c4d5e6f',
      sellsy_company_id: '52457',
      sellsy_company_name: 'Mediarun SAS',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sellsy_company_id).toBe('52457');

    // update companies.sellsy_id appliqué
    const compUpd = state.updates.find((u) => u.table === 'companies');
    expect(compUpd?.values.sellsy_id).toBe('52457');

    // audit_log company-level
    const compAudit = state.inserts.find(
      (i) => i.table === 'audit_log' && (i.values.entity_type as string) === 'companies',
    );
    expect(compAudit).toBeTruthy();
    expect((compAudit?.values.after as Record<string, unknown>).kind).toBe(
      'company_sellsy_link_set',
    );

    // audit_log prospect-level pour chaque prospect lié (2 prospects ici)
    const prospectAudits = state.inserts.filter(
      (i) => i.table === 'audit_log' && (i.values.entity_type as string) === 'prospects',
    );
    expect(prospectAudits).toHaveLength(2);
  });

  it('Rejette si UUID company_id invalide', async () => {
    mockEnv();
    const { linkCompanyToSellsyClientAction } = await import('./sellsy-link-actions');
    const r = await linkCompanyToSellsyClientAction({
      company_id: 'not-uuid',
      sellsy_company_id: '52457',
    });
    expect(r.ok).toBe(false);
  });
});

describe('unlinkCompanyFromSellsyClientAction (P6.x.SellsyDedupClient)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Clear companies.sellsy_id + audit_log si lien existe', async () => {
    state.company = { sellsy_id: 'old-sellsy-id' };
    state.prospects = [{ id: 'p1' }];
    mockEnv();
    const { unlinkCompanyFromSellsyClientAction } = await import('./sellsy-link-actions');
    const r = await unlinkCompanyFromSellsyClientAction({
      company_id: '8c5e2a3f-4b1d-4cdf-9c5e-1a2b3c4d5e6f',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sellsy_company_id).toBe(null);

    const compUpd = state.updates.find((u) => u.table === 'companies');
    expect(compUpd?.values.sellsy_id).toBe(null);

    const compAudit = state.inserts.find(
      (i) => i.table === 'audit_log' && (i.values.entity_type as string) === 'companies',
    );
    expect((compAudit?.values.after as Record<string, unknown>).kind).toBe(
      'company_sellsy_link_removed',
    );
  });

  it('Retourne erreur si pas de lien existant', async () => {
    state.company = { sellsy_id: null };
    mockEnv();
    const { unlinkCompanyFromSellsyClientAction } = await import('./sellsy-link-actions');
    const r = await unlinkCompanyFromSellsyClientAction({
      company_id: '8c5e2a3f-4b1d-4cdf-9c5e-1a2b3c4d5e6f',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Aucun lien/i);
  });
});

describe('searchSellsyClientsAction (P6.x.SellsyDedupClient)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Query < 2 chars → retourne []', async () => {
    mockEnv();
    const { searchSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await searchSellsyClientsAction({ q: 'a' });
    expect(r).toEqual([]);
  });

  it('Search par nom : map les résultats Sellsy en SellsyClientLite', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    (sellsyFetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      data: [{ id: 52457, name: 'Mediarun SAS', siren: '123456789', email: 'a@b.fr' }],
    });
    const { searchSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await searchSellsyClientsAction({ q: 'Mediarun' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('52457');
    expect(r[0].name).toBe('Mediarun SAS');
    expect(r[0].siren).toBe('123456789');
  });

  it('HOTFIX3 — "Win-group" trouve Win-Group SAS même quand passes 2/3 retournent des faux positifs', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mock = sellsyFetch as any;
    // Passes 2/3 : Sellsy retourne des faux positifs (noms qui ne contiennent
    // pas "win group" en substring) → le filter JS doit les écarter et
    // déclencher le fallback pass 4.
    mock
      .mockResolvedValueOnce({ data: [{ id: 999, name: 'Winco Corp', siren: null, email: null }] })
      .mockResolvedValueOnce({ data: [{ id: 998, name: 'Win Systems', siren: null, email: null }] })
      .mockResolvedValueOnce({
        data: [
          { id: 33688, name: 'Win-Group Software SAS', siren: null, email: null },
          { id: 99, name: 'Autre Société', siren: null, email: null },
        ],
      });
    const { searchSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await searchSellsyClientsAction({ q: 'Win-group' });
    expect(r.some((c) => c.id === '33688')).toBe(true);
    expect(r.some((c) => c.id === '999')).toBe(false);
    expect(r.some((c) => c.id === '998')).toBe(false);
  });

  it('HOTFIX3 — "Acast" qui matche Sellsy directement → pas de fallback list+200', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mock = sellsyFetch as any;
    mock.mockResolvedValueOnce({
      data: [{ id: 100, name: 'Acast France', siren: null, email: null }],
    });
    const { searchSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await searchSellsyClientsAction({ q: 'Acast' });
    expect(r.some((c) => c.id === '100')).toBe(true);
    // "acast" normalisé === "acast" → pass 3 skipée ; realMatches non-vide → pas de pass 4
    expect(mock.mock.calls).toHaveLength(1);
  });

  it('HOTFIX2 BUG 1 — "Win-group" match "Win-Group Software SAS" via fallback list+JS', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    // Sellsy ne renvoie rien sur les 3 premiers filters (name brut +
    // name normalisé "win group") MAIS sur le 4e call (list 200) on
    // récupère Win-Group Software SAS → le filter JS normalisé doit
    // matcher car "win group" ⊆ "win group software sas".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mock = sellsyFetch as any;
    mock
      .mockResolvedValueOnce({ data: [] }) // pass 2 : name brut
      .mockResolvedValueOnce({ data: [] }) // pass 3 : name normalisé
      .mockResolvedValueOnce({
        data: [
          { id: 33688, name: 'Win-Group Software SAS', siren: null, email: null },
          { id: 99, name: 'Autre Société', siren: null, email: null },
        ],
      }); // pass 4 : list 200 + JS filter
    const { searchSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await searchSellsyClientsAction({ q: 'Win-group' });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.some((c) => c.id === '33688')).toBe(true);
  });
});

describe('listAllSellsyClientsAction (P6.x.HOTFIX2 BUG 3)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Retourne page 0 + has_more=true si data.length === limit', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    const fiftyItems = Array.from({ length: 50 }, (_, i) => ({
      id: 1000 + i,
      name: `Société ${i}`,
      siren: null,
      email: null,
    }));
    (sellsyFetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      data: fiftyItems,
      pagination: { total: 200 },
    });
    const { listAllSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await listAllSellsyClientsAction({ page: 0, limit: 50 });
    expect(r.data).toHaveLength(50);
    expect(r.has_more).toBe(true);
    expect(r.page).toBe(0);
  });

  it('Retourne has_more=false sur dernière page', async () => {
    mockEnv();
    const { sellsyFetch } = await import('@/lib/sellsy/client');
    (sellsyFetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      data: [{ id: 1, name: 'Dernière' }],
      pagination: { total: 1 },
    });
    const { listAllSellsyClientsAction } = await import('./sellsy-link-actions');
    const r = await listAllSellsyClientsAction({ page: 0, limit: 50 });
    expect(r.has_more).toBe(false);
  });
});
