/**
 * @vitest-environment node
 *
 * P7.x.AffiliateManualCompanyAttach — tests server actions super_admin.
 *
 * Couvre :
 *   - attach : happy path (claim manual_admin active + audit) + propagation prospect
 *   - attach : refus non-super_admin
 *   - attach : conflit (société déjà attribuée à un autre affilié)
 *   - attach : doublon (claim existant sur la paire)
 *   - detach : happy path (delete + audit) + refus non-super_admin
 *   - searchAvailableCompanies : annote already_claimed + court-circuit < 2 char
 *   - mapper P14.4 : nouveaux kinds attached/detached
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapAuditLogToAutoEntry } from '@/lib/admin/prospects/timeline-helpers';

const AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890ab';
const OTHER_AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890cd';
const COMPANY_ID = '6d3f9a5c-3b4e-4faf-bb12-3456789012cd';
const CLAIM_ID = '5c2e8f4b-2a3d-4e9f-aa01-2345678901bc';

interface MockState {
  role: 'admin' | 'sales' | 'super_admin' | null;
  affiliate: { id: string; display_name: string } | null;
  company: { id: string; name: string } | null;
  conflictingClaim: { id: string; affiliate_id: string } | null;
  existingPairClaim: { id: string; status: string } | null;
  claimToDetach: {
    id: string;
    affiliate_id: string;
    company_id: string | null;
    source: string;
    status: string;
  } | null;
  prospectsForCompany: Array<{ id: string }>;
  rpcResult: Array<{ id: string; name: string; primary_domain: string | null; match_type: string }>;
  activeClaimsForIds: Array<{ company_id: string }>;
  inserts: Array<{ table: string; row: Record<string, unknown> | Record<string, unknown>[] }>;
  deletes: Array<{ table: string; id: string }>;
  rpcCalls: Array<{ name: string; params: unknown }>;
}

const state: MockState = {
  role: 'super_admin',
  affiliate: null,
  company: null,
  conflictingClaim: null,
  existingPairClaim: null,
  claimToDetach: null,
  prospectsForCompany: [],
  rpcResult: [],
  activeClaimsForIds: [],
  inserts: [],
  deletes: [],
  rpcCalls: [],
};

function reset() {
  state.role = 'super_admin';
  state.affiliate = { id: AFFILIATE_ID, display_name: 'Fabrice Gauthier' };
  state.company = { id: COMPANY_ID, name: 'towerCast' };
  state.conflictingClaim = null;
  state.existingPairClaim = null;
  state.claimToDetach = null;
  state.prospectsForCompany = [];
  state.rpcResult = [];
  state.activeClaimsForIds = [];
  state.inserts.length = 0;
  state.deletes.length = 0;
  state.rpcCalls.length = 0;
}

function makeSelect(table: string) {
  const filters: Record<string, unknown> = {};
  const builder = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    neq(col: string, val: unknown) {
      filters['neq_' + col] = val;
      return builder;
    },
    is(col: string, val: unknown) {
      filters['is_' + col] = val;
      return builder;
    },
    in(col: string, vals: unknown) {
      filters['in_' + col] = vals;
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return Promise.resolve(resolveList());
    },
    maybeSingle() {
      return Promise.resolve(resolveSingle());
    },
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve(resolveList());
    },
  };
  function resolveSingle() {
    if (table === 'affiliates') return { data: state.affiliate, error: null };
    if (table === 'companies') return { data: state.company, error: null };
    if (table === 'affiliate_claims') {
      if ('neq_affiliate_id' in filters) return { data: state.conflictingClaim, error: null };
      if ('affiliate_id' in filters && 'company_id' in filters)
        return { data: state.existingPairClaim, error: null };
      if ('id' in filters) return { data: state.claimToDetach, error: null };
    }
    return { data: null, error: null };
  }
  function resolveList() {
    if (table === 'prospects') return { data: state.prospectsForCompany, error: null };
    if (table === 'affiliate_claims') return { data: state.activeClaimsForIds, error: null };
    return { data: [], error: null };
  }
  return builder;
}

function makeFakeClient() {
  return {
    from: (table: string) => ({
      select: () => makeSelect(table),
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
        select: () => ({
          single: () => {
            state.inserts.push({ table, row });
            return Promise.resolve({ data: { id: 'new-claim' }, error: null });
          },
        }),
        then: (resolve: (r: { error: null }) => void) => {
          state.inserts.push({ table, row });
          resolve({ error: null });
        },
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
        in: () => Promise.resolve({ error: null }),
        is: () => Promise.resolve({ error: null }),
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          state.deletes.push({ table, id });
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: (name: string, params: unknown) => {
      state.rpcCalls.push({ name, params });
      return Promise.resolve({ data: state.rpcResult, error: null });
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireSuperAdmin: vi.fn(async () => {
      if (state.role !== 'super_admin') throw new Error('Réservé aux super_admin.');
      return {
        id: 'u-super',
        email: 's@b',
        full_name: 'Super Admin',
        role: 'super_admin' as const,
      };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeFakeClient() }));
}

describe('attachCompanyToAffiliateAction (P7.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path : claim manual_admin active + audit log', async () => {
    mockEnv();
    const { attachCompanyToAffiliateAction } = await import('./manual-attach-actions');
    const r = await attachCompanyToAffiliateAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(true);
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    const row = claimInsert?.row as Record<string, unknown>;
    expect(row.source).toBe('manual_admin');
    expect(row.status).toBe('active');
    expect(row.validated_by).toBe('u-super');
    const audit = state.inserts.find(
      (i) =>
        i.table === 'audit_log' &&
        (i.row as Record<string, unknown>).entity_type === 'affiliate_claims',
    );
    expect((audit?.row as { after?: { kind?: string } })?.after?.kind).toBe(
      'affiliate_company_attached',
    );
  });

  it('propage affiliate_id aux prospects + audit prospect-scoped (timeline)', async () => {
    mockEnv();
    state.prospectsForCompany = [{ id: 'p-1' }];
    const { attachCompanyToAffiliateAction } = await import('./manual-attach-actions');
    const r = await attachCompanyToAffiliateAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(true);
    // Un audit batch entity_type='prospects' a été inséré (array).
    const prospectAudit = state.inserts.find(
      (i) => i.table === 'audit_log' && Array.isArray(i.row),
    );
    expect(prospectAudit).toBeDefined();
    const first = (prospectAudit?.row as Record<string, unknown>[])[0];
    expect(first.entity_type).toBe('prospects');
    expect((first.after as { kind?: string }).kind).toBe('affiliate_company_attached');
  });

  it('refuse si non-super_admin', async () => {
    state.role = 'admin';
    mockEnv();
    const { attachCompanyToAffiliateAction } = await import('./manual-attach-actions');
    const r = await attachCompanyToAffiliateAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/i);
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });

  it('refuse si société déjà attribuée à un autre affilié', async () => {
    mockEnv();
    state.conflictingClaim = { id: 'other-claim', affiliate_id: OTHER_AFFILIATE_ID };
    const { attachCompanyToAffiliateAction } = await import('./manual-attach-actions');
    const r = await attachCompanyToAffiliateAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/autre affilié/i);
  });

  it('refuse si un claim existe déjà sur la paire', async () => {
    mockEnv();
    state.existingPairClaim = { id: CLAIM_ID, status: 'pending' };
    const { attachCompanyToAffiliateAction } = await import('./manual-attach-actions');
    const r = await attachCompanyToAffiliateAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/existe déjà/i);
  });
});

describe('detachCompanyFromAffiliateAction (P7.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    state.claimToDetach = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
      source: 'manual_admin',
      status: 'active',
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path : delete + audit affiliate_company_detached', async () => {
    mockEnv();
    const { detachCompanyFromAffiliateAction } = await import('./manual-attach-actions');
    const r = await detachCompanyFromAffiliateAction({
      claim_id: CLAIM_ID,
      reason: 'attribution erronée',
    });
    expect(r.ok).toBe(true);
    expect(
      state.deletes.find((d) => d.table === 'affiliate_claims' && d.id === CLAIM_ID),
    ).toBeDefined();
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row as { after?: { kind?: string } })?.after?.kind).toBe(
      'affiliate_company_detached',
    );
  });

  it('refuse si non-super_admin', async () => {
    state.role = 'sales';
    mockEnv();
    const { detachCompanyFromAffiliateAction } = await import('./manual-attach-actions');
    const r = await detachCompanyFromAffiliateAction({ claim_id: CLAIM_ID, reason: 'test' });
    expect(r.ok).toBe(false);
    expect(state.deletes).toHaveLength(0);
  });
});

describe('searchAvailableCompaniesAction (P7.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('annote already_claimed via claims actifs', async () => {
    mockEnv();
    state.rpcResult = [
      { id: COMPANY_ID, name: 'towerCast', primary_domain: 'towercast.fr', match_type: 'exact' },
      { id: 'co-2', name: 'TowerCo', primary_domain: null, match_type: 'fuzzy' },
    ];
    state.activeClaimsForIds = [{ company_id: COMPANY_ID }];
    const { searchAvailableCompaniesAction } = await import('./manual-attach-actions');
    const r = await searchAvailableCompaniesAction({ query: 'tower' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data.find((c) => c.id === COMPANY_ID)?.already_claimed).toBe(true);
      expect(r.data.find((c) => c.id === 'co-2')?.already_claimed).toBe(false);
    }
    expect(state.rpcCalls[0].name).toBe('search_companies_fuzzy');
  });

  it('court-circuite si query < 2 caractères', async () => {
    mockEnv();
    const { searchAvailableCompaniesAction } = await import('./manual-attach-actions');
    const r = await searchAvailableCompaniesAction({ query: 'a' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe('mapAuditLogToAutoEntry — kinds P7.x', () => {
  it('affiliate_company_attached → chip avec nom affilié', () => {
    const r = mapAuditLogToAutoEntry({
      id: 'a-1',
      user_id: 'u-super',
      entity_id: 'p-1',
      entity_type: 'prospects',
      action: 'update',
      before: null,
      after: { kind: 'affiliate_company_attached', affiliate_name: 'Fabrice Gauthier' },
      created_at: '2026-06-09T10:00:00Z',
    });
    expect(r.kind).toBe('affiliate_company_attached');
    expect(r.content).toMatch(/Fabrice Gauthier/);
  });

  it('affiliate_company_detached → chip', () => {
    const r = mapAuditLogToAutoEntry({
      id: 'a-2',
      user_id: 'u-super',
      entity_id: 'c-1',
      entity_type: 'affiliate_claims',
      action: 'delete',
      before: null,
      after: { kind: 'affiliate_company_detached', reason: 'doublon' },
      created_at: '2026-06-09T10:00:00Z',
    });
    expect(r.kind).toBe('affiliate_company_detached');
    expect(r.content).toMatch(/détachée/i);
  });
});
