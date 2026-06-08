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
});
