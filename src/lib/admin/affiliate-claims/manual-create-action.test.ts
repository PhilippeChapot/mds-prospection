/**
 * @vitest-environment node
 *
 * P5.x.AffiliateClaimsUI — tests createManualAffiliateClaimAction.
 *
 * Couvre :
 *   - happy path company_id → claim source='manual_admin' + audit
 *   - happy path prospect_id → claim + propagation affiliate_id
 *   - prospect déjà lié → pas d'écrasement
 *   - doublon active → existing_claim_id
 *   - doublon pending → existing_claim_id
 *   - ni company_id ni prospect_id → Zod error
 *   - audit kind = 'affiliate_claim_manual_created'
 *   - non-admin → error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890ab';
const COMPANY_ID = '6d3f9a5c-3b4e-4faf-bb12-3456789012cd';
const PROSPECT_ID = '7e4f0b6d-4c5f-4a8f-ab23-4567890123de';
const NEW_CLAIM_ID = 'a1b2c3d4-1234-5678-abcd-ef0123456789';

interface MockState {
  role: 'admin' | 'sales' | 'super_admin' | null;
  existingClaim: { id: string; status: string } | null;
  prospectAffiliateId: string | null;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  prospectUpdated: boolean;
}

const state: MockState = {
  role: 'admin',
  existingClaim: null,
  prospectAffiliateId: null,
  inserts: [],
  prospectUpdated: false,
};

function reset() {
  state.role = 'admin';
  state.existingClaim = null;
  state.prospectAffiliateId = null;
  state.inserts.length = 0;
  state.prospectUpdated = false;
}

function makeSelectBuilder(table: string) {
  const builder = {
    eq(_c: string, _v: unknown) {
      return builder;
    },
    neq(_c: string, _v: unknown) {
      return builder;
    },
    in(_c: string, _v: unknown) {
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      if (table === 'affiliate_claims') {
        return Promise.resolve({ data: state.existingClaim, error: null });
      }
      if (table === 'prospects') {
        return Promise.resolve({
          data: { affiliate_id: state.prospectAffiliateId },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve({ data: [], error: null });
    },
  };
  return builder;
}

function makeFakeClient() {
  return {
    from: (table: string) => ({
      select: () => makeSelectBuilder(table),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            state.inserts.push({ table, row });
            if (table === 'affiliate_claims') {
              return Promise.resolve({ data: { id: NEW_CLAIM_ID }, error: null });
            }
            return Promise.resolve({ data: { id: 'audit-id' }, error: null });
          },
        }),
        then: (resolve: (r: { error: null }) => void) => {
          state.inserts.push({ table, row });
          resolve({ error: null });
        },
      }),
      update: (_fields: Record<string, unknown>) => ({
        eq: (_c: string, _v: unknown) => {
          if (table === 'prospects') state.prospectUpdated = true;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.role || state.role === 'sales') throw new Error('Accès admin requis.');
      return { id: 'u-admin', email: 'a@b.com', full_name: 'Admin', role: state.role };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeFakeClient() }));
}

describe('createManualAffiliateClaimAction (P5.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path company_id → claim source=manual_admin, status=active', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(true);
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.source).toBe('manual_admin');
    expect(claimInsert?.row.status).toBe('active');
    expect(claimInsert?.row.company_id).toBe(COMPANY_ID);
    expect(claimInsert?.row.validated_by).toBe('u-admin');
  });

  it('audit log kind = affiliate_claim_manual_created', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({ affiliate_id: AFFILIATE_ID, company_id: COMPANY_ID });
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as { kind?: string })?.kind).toBe('affiliate_claim_manual_created');
  });

  it('happy path prospect_id + affiliate_id absent → propage affiliate_id au prospect', async () => {
    mockEnv();
    state.prospectAffiliateId = null;
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdated).toBe(true);
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.prospect_id).toBe(PROSPECT_ID);
  });

  it('prospect déjà lié à un autre affilié → ne pas écraser', async () => {
    mockEnv();
    state.prospectAffiliateId = 'other-affiliate-id';
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdated).toBe(false);
  });

  it('doublon active → retourne existing_claim_id', async () => {
    mockEnv();
    state.existingClaim = { id: 'existing-id', status: 'active' };
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.existing_claim_id).toBe('existing-id');
      expect(r.error).toMatch(/existe déjà/i);
    }
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });

  it('doublon pending → retourne existing_claim_id', async () => {
    mockEnv();
    state.existingClaim = { id: 'pending-id', status: 'pending' };
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.existing_claim_id).toBe('pending-id');
  });

  it('ni company_id ni prospect_id → Zod refine error', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({ affiliate_id: AFFILIATE_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/company_id|prospect_id/i);
  });

  it('non-admin (sales) → error Accès admin requis', async () => {
    state.role = 'sales';
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/i);
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });
});
