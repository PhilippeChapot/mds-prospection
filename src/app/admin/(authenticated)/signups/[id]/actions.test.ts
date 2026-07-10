/**
 * @vitest-environment node
 *
 * P5.x.SignupForceConversion — tests server action convertSignupToProspect.
 *
 * Couvre :
 *   - validation : force=true sans force_reason → erreur avant DB
 *   - garde-fou normal : force=false sur step2_started → erreur status
 *   - force conversion : step2_started + force_reason → success + audit kind='signup_force_converted'
 *   - mapper P14.4 : signup_force_converted → chip orange ⚠️
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapAuditLogToAutoEntry } from '@/lib/admin/prospects/timeline-helpers';

const SIGNUP_ID = 'aa000000-0000-0000-0000-000000000001';
const PROFILE_ID = 'bb000000-0000-0000-0000-000000000002';

interface MockState {
  signupStatus: string;
  inserts: Array<{ table: string; row: unknown }>;
}

const state: MockState = {
  signupStatus: 'step2_completed',
  inserts: [],
};

function reset() {
  state.signupStatus = 'step2_completed';
  state.inserts.length = 0;
}

function makeSignup(status: string) {
  return {
    id: SIGNUP_ID,
    email: 'test@example.com',
    email_domain: 'example.com',
    contact_first_name: 'Test',
    contact_last_name: 'User',
    contact_phone: null,
    company_name_input: 'Test Corp',
    matched_company_id: null,
    derived_category: 'standard',
    language: 'FR',
    ai_classification: null,
    step2_payload: null,
    status,
    converted_to_prospect_id: null,
    affiliate_input_raw: null,
    affiliate_id: null,
    vat_country: null,
    vat_number: null,
    vat_verified: null,
    vat_verified_at: null,
  };
}

function makeBuilder(table: string) {
  let _method = '';
  const filters: Record<string, unknown> = {};

  const builder: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    neq() {
      return builder;
    },
    is() {
      return builder;
    },
    in() {
      return builder;
    },
    ilike() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      // Companies/contacts lookup → no match (triggers insert)
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle() {
      if (table === 'public_signup_attempts') {
        return Promise.resolve({ data: makeSignup(state.signupStatus), error: null });
      }
      if (table === 'pricing_tiers') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  _method = table; // suppress unused warning
  void _method;
  return builder;
}

function makeFakeClient() {
  return {
    from: (table: string) => ({
      select: (_cols?: string) => makeBuilder(table),
      insert: (row: unknown) => ({
        select: () => ({
          single: () => {
            state.inserts.push({ table, row });
            const idMap: Record<string, string> = {
              companies: 'co-test',
              contacts: 'ct-test',
              prospects: 'pr-test',
              affiliate_claims: 'cl-test',
            };
            return Promise.resolve({ data: { id: idMap[table] ?? 'new-id' }, error: null });
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
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: PROFILE_ID,
      email: 'admin@mds.fr',
      full_name: 'Admin',
      role: 'admin' as const,
    })),
    getActiveSeasonId: vi.fn(async () => 'season-2026'),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: vi.fn(() => true),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeFakeClient() }));
  vi.doMock('@/lib/sellsy/post-conversion', () => ({
    runPostConversion: vi.fn(async () => {}),
  }));
  vi.doMock('@/lib/admin/prospects/hydrate-quote-items', () => ({
    hydrateQuoteItemsFromSelection: vi.fn(async () => ({ quote_items: [], warnings: [] })),
  }));
  vi.doMock('@/lib/brevo/sync-signup-lifecycle', () => ({
    syncSignupLifecycle: vi.fn(async () => {}),
  }));
  vi.doMock('@/lib/insee/recheck-prospect-siren', () => ({
    recheckCompanySirenForProspect: vi.fn(async () => {}),
  }));
  vi.doMock('@/lib/external-events/signup-alert', () => ({
    triggerExternalEventSignupAlert: vi.fn(async () => {}),
  }));
  vi.doMock('@/lib/ai/classify-signup', () => ({
    classifySignup: vi.fn(async () => null),
    extractEmailDomain: vi.fn((email: string) => email.split('@')[1] ?? null),
  }));
}

describe('convertSignupToProspect (P5.x.ForceConversion)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuse force=true sans force_reason (validation avant DB)', async () => {
    mockEnv();
    const { convertSignupToProspect } = await import('./actions');
    const r = await convertSignupToProspect(SIGNUP_ID, { force: true, force_reason: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/obligatoire/i);
    // Aucun INSERT ne doit avoir eu lieu
    expect(state.inserts).toHaveLength(0);
  });

  it('refuse conversion normale si status != step2_completed', async () => {
    state.signupStatus = 'step2_started';
    mockEnv();
    const { convertSignupToProspect } = await import('./actions');
    const r = await convertSignupToProspect(SIGNUP_ID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/step2_completed/i);
  });

  it('force conversion step2_started + raison → success + audit kind=signup_force_converted', async () => {
    state.signupStatus = 'step2_started';
    mockEnv();
    const { convertSignupToProspect } = await import('./actions');
    const r = await convertSignupToProspect(SIGNUP_ID, {
      force: true,
      force_reason: 'Phil rappellera pour finaliser',
    });
    expect(r.success).toBe(true);

    // L'audit_log doit avoir kind='signup_force_converted'
    const auditInsert = state.inserts.find(
      (i) =>
        i.table === 'audit_log' && (i.row as Record<string, unknown>).entity_type === 'prospects',
    );
    expect(auditInsert).toBeDefined();
    const after = (auditInsert?.row as Record<string, unknown>).after as Record<string, unknown>;
    expect(after.kind).toBe('signup_force_converted');
    expect(after.force_reason).toBe('Phil rappellera pour finaliser');
    expect(after.status_at_conversion).toBe('step2_started');
  });
});

describe('markSignupViewed (MDS-Prospection-SignupNotifs+Badge)', () => {
  const viewedState: { updates: Array<{ patch: Record<string, unknown>; filters: string[] }> } = {
    updates: [],
  };

  function mockViewedEnv(role: 'admin' | 'sales' = 'admin') {
    vi.doMock('@/lib/supabase/auth-helpers', () => ({
      requireAdminProfile: vi.fn(async () => ({
        id: PROFILE_ID,
        email: 'admin@mds.fr',
        full_name: 'Admin',
        role,
      })),
    }));
    vi.doMock('@/lib/auth/role-helpers', () => ({
      hasAdminAccess: vi.fn((r: string) => r !== 'sales'),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => ({
              is: (col2: string, val2: unknown) => {
                viewedState.updates.push({
                  patch,
                  filters: [`eq:${col}=${val}`, `is:${col2}=${val2}`],
                });
                return Promise.resolve({ error: null });
              },
            }),
          }),
        }),
      }),
    }));
  }

  beforeEach(() => {
    vi.resetModules();
    viewedState.updates.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin -> UPDATE viewed_by_admin_at avec garde-fou is-null (idempotent)', async () => {
    mockViewedEnv('admin');
    const { markSignupViewed } = await import('./actions');
    const result = await markSignupViewed(SIGNUP_ID);
    expect(result.success).toBe(true);
    expect(viewedState.updates).toHaveLength(1);
    expect(viewedState.updates[0].filters).toContain(`eq:id=${SIGNUP_ID}`);
    expect(viewedState.updates[0].filters).toContain('is:viewed_by_admin_at=null');
    expect(viewedState.updates[0].patch).toHaveProperty('viewed_by_admin_at');
  });

  it('sales -> refuse (pas de UPDATE)', async () => {
    mockViewedEnv('sales');
    const { markSignupViewed } = await import('./actions');
    const result = await markSignupViewed(SIGNUP_ID);
    expect(result.success).toBe(false);
    expect(viewedState.updates).toHaveLength(0);
  });
});

describe('mapAuditLogToAutoEntry — signup_force_converted (P5.x)', () => {
  it('retourne kind=signup_force_converted + chip orange ⚠️', () => {
    const r = mapAuditLogToAutoEntry({
      id: 'a-1',
      user_id: null,
      entity_id: 'p-1',
      entity_type: 'prospects',
      action: 'create',
      before: null,
      after: {
        kind: 'signup_force_converted',
        email: 'test@example.com',
        force_reason: 'Phil rappellera',
        status_at_conversion: 'step2_started',
      },
      created_at: '2026-06-09T10:00:00Z',
    });
    expect(r.kind).toBe('signup_force_converted');
    expect(r.content).toMatch(/forcé/i);
    expect(r.content).toMatch(/Phil rappellera/);
  });
});
