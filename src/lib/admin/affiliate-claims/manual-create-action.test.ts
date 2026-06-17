/**
 * @vitest-environment node
 *
 * P5.x.AffiliateClaimsUI + P5.x.AffiliateAttachUnification
 * — tests createManualAffiliateClaimAction.
 *
 * Couvre (8 originaux + 11 nouveaux) :
 *   - happy path company_id → claim source='manual_admin' + audit
 *   - audit kind = affiliate_claim_manual_created
 *   - happy path prospect_id → claim + propagation affiliate_id
 *   - prospect déjà lié → pas d'écrasement
 *   - doublon active → existing_claim_id
 *   - doublon pending → existing_claim_id
 *   - ni company_id ni prospect_id → Zod error
 *   - non-admin → error
 *   - cross-affilié company_id → ok:false "autre affilié"
 *   - cross-affilié non déclenché pour prospect_id seul
 *   - cross-affilié non déclenché quand pas de conflit
 *   - notes_admin trimées et persistées
 *   - notes_admin absent → null dans l'insert
 *   - company_id ET prospect_id → claim créé avec les deux
 *   - revalidatePath inclut /admin/affiliates/{affiliate_id}
 *   - revalidatePath inclut /admin/companies/{company_id}
 *   - revalidatePath inclut /admin/prospects/{prospect_id}
 *   - revalidatePath inclut /admin/affiliate-claims
 *   - affiliate_id UUID invalide → Zod error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890ab';
const OTHER_AFFILIATE_ID = '5c2e8f4b-2a3d-4e9f-9a1b-2345678901bc';
const COMPANY_ID = '6d3f9a5c-3b4e-4faf-bb12-3456789012cd';
const PROSPECT_ID = '7e4f0b6d-4c5f-4a8f-ab23-4567890123de';
const NEW_CLAIM_ID = 'a1b2c3d4-1234-5678-abcd-ef0123456789';

interface MockState {
  role: 'admin' | 'sales' | 'super_admin' | null;
  existingClaim: { id: string; status: string } | null;
  conflictingClaim: { id: string } | null;
  prospectAffiliateId: string | null;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  prospectUpdated: boolean;
  revalidatedPaths: string[];
}

const state: MockState = {
  role: 'admin',
  existingClaim: null,
  conflictingClaim: null,
  prospectAffiliateId: null,
  inserts: [],
  prospectUpdated: false,
  revalidatedPaths: [],
};

function reset() {
  state.role = 'admin';
  state.existingClaim = null;
  state.conflictingClaim = null;
  state.prospectAffiliateId = null;
  state.inserts.length = 0;
  state.prospectUpdated = false;
  state.revalidatedPaths.length = 0;
}

function makeSelectBuilder(table: string) {
  let hasNeq = false;
  const builder = {
    eq(_c: string, _v: unknown) {
      return builder;
    },
    neq(_c: string, _v: unknown) {
      hasNeq = true;
      return builder;
    },
    in(_c: string, _v: unknown) {
      return builder;
    },
    not(_c: string, _op: string, _v: unknown) {
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      if (table === 'affiliate_claims') {
        // Cross-affiliate check uses .neq()
        if (hasNeq) {
          return Promise.resolve({ data: state.conflictingClaim, error: null });
        }
        // Anti-doublon check
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
  vi.doMock('next/cache', () => ({
    revalidatePath: vi.fn((p: string) => {
      state.revalidatedPaths.push(p);
    }),
  }));
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

  // --- 8 tests originaux ---

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

  // --- 11 nouveaux tests (P5.x.AffiliateAttachUnification) ---

  it('cross-affilié company_id déjà active → ok:false, error "autre affilié"', async () => {
    mockEnv();
    state.conflictingClaim = { id: 'conflict-claim-id' };
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/autre affilié/i);
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });

  it('cross-affilié non déclenché pour prospect_id seul (pas de company_id)', async () => {
    mockEnv();
    state.conflictingClaim = { id: 'should-not-trigger' };
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(r.ok).toBe(true);
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeDefined();
  });

  it('cross-affilié non déclenché quand pas de conflit (conflictingClaim null)', async () => {
    mockEnv();
    state.conflictingClaim = null;
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(true);
  });

  it('notes_admin trimmé et persisté dans le claim insert', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
      notes_admin: '  note avec espaces  ',
    });
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.notes_admin).toBe('note avec espaces');
  });

  it('notes_admin absent → null dans le claim insert', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.notes_admin).toBeNull();
  });

  it('company_id ET prospect_id fournis → claim créé avec les deux', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(r.ok).toBe(true);
    const claimInsert = state.inserts.find((i) => i.table === 'affiliate_claims');
    expect(claimInsert?.row.company_id).toBe(COMPANY_ID);
    expect(claimInsert?.row.prospect_id).toBe(PROSPECT_ID);
  });

  it('revalidatePath inclut /admin/affiliates/{affiliate_id}', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(state.revalidatedPaths).toContain(`/admin/affiliates/${AFFILIATE_ID}`);
  });

  it('revalidatePath inclut /admin/companies/{company_id} quand company_id fourni', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(state.revalidatedPaths).toContain(`/admin/companies/${COMPANY_ID}`);
  });

  it('revalidatePath inclut /admin/prospects/{prospect_id} quand prospect_id fourni', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(state.revalidatedPaths).toContain(`/admin/prospects/${PROSPECT_ID}`);
  });

  it('revalidatePath inclut /admin/affiliate-claims', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: COMPANY_ID,
    });
    expect(state.revalidatedPaths).toContain('/admin/affiliate-claims');
  });

  it('affiliate_id UUID invalide → Zod error', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: 'not-a-uuid',
      company_id: COMPANY_ID,
    });
    expect(r.ok).toBe(false);
    expect(state.inserts.find((i) => i.table === 'affiliate_claims')).toBeUndefined();
  });

  it('company_id UUID invalide → Zod error', async () => {
    mockEnv();
    const { createManualAffiliateClaimAction } = await import('./manual-create-action');
    const r = await createManualAffiliateClaimAction({
      affiliate_id: AFFILIATE_ID,
      company_id: 'invalid-uuid',
    });
    expect(r.ok).toBe(false);
  });
});
