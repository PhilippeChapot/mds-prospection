/**
 * @vitest-environment node
 *
 * P7.x.1.F — tests server actions affiliate_claims.
 *
 * Couvre :
 *   - declareCompanyByAffiliateAction : smart match exact, no-match, doublon
 *   - validateAffiliateClaimAction : pending -> active, conflict detection
 *   - rejectAffiliateClaimAction : pending -> rejected
 *   - deleteAffiliateClaimAction : super_admin requis (403 sinon)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// UUIDs valides v4 (Zod .uuid() exige le format complet).
const AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890ab';
const OTHER_AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890cd';
const CLAIM_ID = '5c2e8f4b-2a3d-4e9f-aa01-2345678901bc';
const COMPANY_ID = '6d3f9a5c-3b4e-4faf-bb12-3456789012cd';

interface MockState {
  affiliateSessionOk: boolean;
  adminRole: 'admin' | 'sales' | 'super_admin' | null;
  // Pour le smart match : list companies en base
  companies: Array<{ id: string; name: string; primary_domain: string | null }>;
  // Claim en DB (lookup par id)
  claim: {
    id: string;
    affiliate_id: string;
    company_id: string | null;
    declared_company_name: string | null;
    declared_company_website: string | null;
    status: 'pending' | 'active' | 'rejected';
  } | null;
  // Pour conflict detection (validate)
  conflictingClaim: { id: string; affiliate_id: string } | null;
  // Existing claim on (affiliate, company) — pour doublon detection
  existingClaimOnPair: { id: string; status: string } | null;
  // Trace des operations
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
  deletes: Array<{ table: string; id: string }>;
}

const state: MockState = {
  affiliateSessionOk: true,
  adminRole: 'admin',
  companies: [],
  claim: null,
  conflictingClaim: null,
  existingClaimOnPair: null,
  inserts: [],
  updates: [],
  deletes: [],
};

function resetState() {
  state.affiliateSessionOk = true;
  state.adminRole = 'admin';
  state.companies = [];
  state.claim = null;
  state.conflictingClaim = null;
  state.existingClaimOnPair = null;
  state.inserts.length = 0;
  state.updates.length = 0;
  state.deletes.length = 0;
}

function mockEnv() {
  vi.doMock('@/lib/affilie/session', () => ({
    requireAffilieSession: vi.fn(async () => {
      if (!state.affiliateSessionOk) throw new Error('redirect');
      return { affiliateId: AFFILIATE_ID };
    }),
  }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.adminRole) throw new Error('redirect');
      return { id: 'u-admin', email: 'a@b', full_name: null, role: state.adminRole };
    }),
    requireSuperAdmin: vi.fn(async () => {
      if (state.adminRole !== 'super_admin') {
        throw new Error('Réservé aux super_admin.');
      }
      return { id: 'u-super', email: 's@b', full_name: null, role: 'super_admin' as const };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeFakeClient(),
  }));
}

function makeFakeClient() {
  return {
    from: (table: string) => makeFakeQuery(table),
  };
}

function makeFakeQuery(table: string) {
  return {
    select: () => ({
      eq: (col: string, val: string) => ({
        eq: (col2: string, val2: string) => ({
          neq: (_c3: string, _v3: string) => ({
            maybeSingle: () => Promise.resolve({ data: state.conflictingClaim, error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: state.existingClaimOnPair, error: null }),
        }),
        maybeSingle: () => Promise.resolve({ data: state.claim, error: null }),
      }),
      or: () => ({
        limit: () =>
          Promise.resolve({
            data: state.companies.filter((c) => c.primary_domain !== null).slice(0, 1),
            error: null,
          }),
      }),
      limit: () => Promise.resolve({ data: state.companies, error: null }),
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          state.inserts.push({ table, row });
          return Promise.resolve({ data: { id: `inserted-${state.inserts.length}` }, error: null });
        },
      }),
      then: (resolve: (r: { error: null }) => void) => {
        state.inserts.push({ table, row });
        resolve({ error: null });
      },
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, _val: string) => {
        state.updates.push({ table, patch });
        return Promise.resolve({ error: null });
      },
      is: () => Promise.resolve({ error: null }),
    }),
    delete: () => ({
      eq: (_col: string, id: string) => {
        state.deletes.push({ table, id });
        return Promise.resolve({ error: null });
      },
    }),
  };
}

describe('declareCompanyByAffiliateAction (P7.x.1.F)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path : pas de match -> claim cree status=pending sans company_id', async () => {
    mockEnv();
    state.companies = [{ id: 'co-other', name: 'Random Company', primary_domain: null }];
    const { declareCompanyByAffiliateAction } = await import('./actions');
    const r = await declareCompanyByAffiliateAction('fr', {
      declared_company_name: 'Société Totalement Inventée XYZ',
      declared_company_website: '',
      notes_affiliate: 'Démarchée au salon',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.matchedCompanyId).toBeNull();
      expect(r.data.status).toBe('pending');
    }
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.status).toBe('pending');
    expect(claimInsert?.row.source).toBe('declared_by_affiliate');
    expect(claimInsert?.row.company_id).toBeNull();
    // Audit log INSERT effectue
    expect(state.inserts.find((i) => i.table === 'audit_log')).toBeDefined();
  });

  it('match exact par nom -> matchedCompanyId rempli + claim toujours pending (anti-fraude)', async () => {
    mockEnv();
    state.companies = [{ id: COMPANY_ID, name: 'Radio France', primary_domain: null }];
    const { declareCompanyByAffiliateAction } = await import('./actions');
    const r = await declareCompanyByAffiliateAction('fr', {
      declared_company_name: 'Radio France',
      declared_company_website: '',
      notes_affiliate: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.matchedCompanyId).toBe(COMPANY_ID);
      // Anti-fraude : pending meme si match exact
      expect(r.data.status).toBe('pending');
    }
  });

  it('doublon detected : claim existant sur paire -> refus avec message clair', async () => {
    mockEnv();
    state.companies = [{ id: COMPANY_ID, name: 'Radio France', primary_domain: null }];
    state.existingClaimOnPair = { id: 'c-prev', status: 'active' };
    const { declareCompanyByAffiliateAction } = await import('./actions');
    const r = await declareCompanyByAffiliateAction('fr', {
      declared_company_name: 'Radio France',
      declared_company_website: '',
      notes_affiliate: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/déjà un claim/);
    // Pas d'insert claim (refus avant)
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });

  it('input invalide (nom < 2 chars) -> Zod refuse', async () => {
    mockEnv();
    const { declareCompanyByAffiliateAction } = await import('./actions');
    const r = await declareCompanyByAffiliateAction('fr', {
      declared_company_name: 'X',
      declared_company_website: '',
      notes_affiliate: '',
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateAffiliateClaimAction (P7.x.1.F)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('pending -> active avec company_id fourni par admin', async () => {
    mockEnv();
    state.claim = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: null,
      declared_company_name: 'Test',
      declared_company_website: null,
      status: 'pending',
    };
    const { validateAffiliateClaimAction } = await import('./actions');
    const r = await validateAffiliateClaimAction({
      claim_id: CLAIM_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.companyId).toBe(COMPANY_ID);
    const claimUpd = state.updates.find((u) => u.table === 'affiliate_claims');
    expect(claimUpd?.patch.status).toBe('active');
    expect(claimUpd?.patch.validated_by).toBe('u-admin');
  });

  it('claim deja active -> refus', async () => {
    mockEnv();
    state.claim = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
      declared_company_name: null,
      declared_company_website: null,
      status: 'active',
    };
    const { validateAffiliateClaimAction } = await import('./actions');
    const r = await validateAffiliateClaimAction({ claim_id: CLAIM_ID, company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/active/);
  });

  it('conflict : autre affilie deja actif sur cette company -> refus', async () => {
    mockEnv();
    state.claim = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: null,
      declared_company_name: 'Test',
      declared_company_website: null,
      status: 'pending',
    };
    state.conflictingClaim = { id: 'c-other', affiliate_id: OTHER_AFFILIATE_ID };
    const { validateAffiliateClaimAction } = await import('./actions');
    const r = await validateAffiliateClaimAction({
      claim_id: CLAIM_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Conflit/);
  });
});

describe('rejectAffiliateClaimAction (P7.x.1.F)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('pending -> rejected avec raison + audit log', async () => {
    mockEnv();
    state.claim = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: null,
      declared_company_name: null,
      declared_company_website: null,
      status: 'pending',
    };
    const { rejectAffiliateClaimAction } = await import('./actions');
    const r = await rejectAffiliateClaimAction({
      claim_id: CLAIM_ID,
      rejected_reason: 'Société déjà cliente directe',
    });
    expect(r.ok).toBe(true);
    const upd = state.updates.find((u) => u.table === 'affiliate_claims');
    expect(upd?.patch.status).toBe('rejected');
    expect(upd?.patch.rejected_reason).toBe('Société déjà cliente directe');
    expect(state.inserts.find((i) => i.table === 'audit_log')).toBeDefined();
  });

  it('raison trop courte (< 3) -> Zod refuse', async () => {
    mockEnv();
    const { rejectAffiliateClaimAction } = await import('./actions');
    const r = await rejectAffiliateClaimAction({
      claim_id: CLAIM_ID,
      rejected_reason: 'X',
    });
    expect(r.ok).toBe(false);
  });
});

describe('deleteAffiliateClaimAction (P7.x.1.F)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('role=admin -> 403 (super_admin only)', async () => {
    state.adminRole = 'admin';
    mockEnv();
    const { deleteAffiliateClaimAction } = await import('./actions');
    const r = await deleteAffiliateClaimAction({
      claim_id: CLAIM_ID,
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/);
    expect(state.deletes).toHaveLength(0);
  });

  it('role=super_admin -> DELETE + audit log strict', async () => {
    state.adminRole = 'super_admin';
    mockEnv();
    state.claim = {
      id: CLAIM_ID,
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
      declared_company_name: null,
      declared_company_website: null,
      status: 'active',
    };
    const { deleteAffiliateClaimAction } = await import('./actions');
    const r = await deleteAffiliateClaimAction({
      claim_id: CLAIM_ID,
      reason: 'Fraude détectée',
    });
    expect(r.ok).toBe(true);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0].id).toBe(CLAIM_ID);
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect(audit).toBeDefined();
    expect((audit?.row.after as { reason: string }).reason).toBe('Fraude détectée');
    expect((audit?.row.after as { actor_role: string }).actor_role).toBe('super_admin');
  });
});
