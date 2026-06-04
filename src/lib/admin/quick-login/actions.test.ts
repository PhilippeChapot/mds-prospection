/**
 * @vitest-environment node
 *
 * P12.x.SuperAdminQuickLogin — tests server actions raccourcis demo.
 *
 * Couvre (>=6) :
 *   1. Affilie : OK → cookie set + audit + redirect_url
 *   2. Affilie : demo_affiliate_id non configure → ok:false + message
 *   3. Affilie : affiliate introuvable → ok:false
 *   4. Partenaire : OK → cookie set + audit
 *   5. Partenaire : demo_partenaire_contact_id absent → ok:false
 *   6. RBAC : requireSuperAdmin throw si role=admin → propagation
 *   7. Audit log : kind correct (super_admin_quick_login_affilie)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  adminRole: 'super_admin' as 'admin' | 'sales' | 'super_admin' | null,
  settings: new Map<string, string>(),
  affiliates: new Map<string, { id: string; display_name: string; contact_email: string }>(),
  contacts: new Map<
    string,
    {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      company_id: string;
    }
  >(),
  audit: [] as Array<{ table: string; row: Record<string, unknown> }>,
  cookiesSet: [] as Array<{ name: string; value: string; opts: Record<string, unknown> }>,
};

function makeClient() {
  return {
    from: (table: string) => makeChain(table),
  };
}

function makeChain(table: string) {
  let filterCol: string | null = null;
  let filterVal: unknown = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filterCol = col;
      filterVal = val;
      return chain;
    },
    maybeSingle: () => {
      if (table === 'app_settings' && filterCol === 'key') {
        const v = state.settings.get(String(filterVal));
        return Promise.resolve({ data: v ? { value: v } : null, error: null });
      }
      if (table === 'affiliates' && filterCol === 'id') {
        const v = state.affiliates.get(String(filterVal));
        return Promise.resolve({ data: v ?? null, error: null });
      }
      if (table === 'contacts' && filterCol === 'id') {
        const v = state.contacts.get(String(filterVal));
        return Promise.resolve({ data: v ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      if (table === 'audit_log') state.audit.push({ table, row });
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

function mockEnv() {
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
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      set: (name: string, value: string, opts: Record<string, unknown>) => {
        state.cookiesSet.push({ name, value, opts });
      },
    }),
  }));
  vi.doMock('@/lib/affilie/jwt', () => ({
    signAffilieSessionToken: vi.fn(async (id: string) => `fake-affilie-token-${id}`),
    AFFILIE_SESSION_COOKIE: 'affilie_session',
    AFFILIE_SESSION_MAX_AGE: 60 * 60,
  }));
  vi.doMock('@/lib/espace-partenaire/jwt', () => ({
    signContactSessionToken: vi.fn(async (id: string) => `fake-contact-token-${id}`),
    ESPACE_EXPOSANT_SESSION_COOKIE: 'espace_partenaire_session',
    ESPACE_EXPOSANT_SESSION_MAX_AGE: 60 * 60,
  }));
}

function resetState() {
  state.adminRole = 'super_admin';
  state.settings.clear();
  state.affiliates.clear();
  state.contacts.clear();
  state.audit = [];
  state.cookiesSet = [];
}

describe('quickLoginAsAffilieDemoAction (P12.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('OK : cookie set + audit + redirect_url', async () => {
    state.settings.set('demo_affiliate_id', 'aff-demo-1');
    state.affiliates.set('aff-demo-1', {
      id: 'aff-demo-1',
      display_name: 'Demo Affiliate',
      contact_email: 'demo@aff.test',
    });
    mockEnv();
    const { quickLoginAsAffilieDemoAction } = await import('./actions');
    const res = await quickLoginAsAffilieDemoAction();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirect_url).toBe('/fr/affilie/dashboard');
    expect(state.cookiesSet[0]?.name).toBe('affilie_session');
    expect(state.cookiesSet[0]?.value).toBe('fake-affilie-token-aff-demo-1');
    expect(state.audit[0]?.row.action).toBe('update');
    expect((state.audit[0]?.row.after as Record<string, unknown>)?.kind).toBe(
      'super_admin_quick_login_affilie',
    );
  });

  it('Setting demo_affiliate_id non configure → ok:false', async () => {
    mockEnv();
    const { quickLoginAsAffilieDemoAction } = await import('./actions');
    const res = await quickLoginAsAffilieDemoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/demo_affiliate_id/);
    expect(state.cookiesSet).toHaveLength(0);
  });

  it('Affilie introuvable en DB → ok:false', async () => {
    state.settings.set('demo_affiliate_id', 'aff-ghost');
    mockEnv();
    const { quickLoginAsAffilieDemoAction } = await import('./actions');
    const res = await quickLoginAsAffilieDemoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/);
  });

  it('RBAC : admin (pas super_admin) → throw propage', async () => {
    state.adminRole = 'admin';
    state.settings.set('demo_affiliate_id', 'aff-demo-1');
    state.affiliates.set('aff-demo-1', {
      id: 'aff-demo-1',
      display_name: 'X',
      contact_email: 'x@x.com',
    });
    mockEnv();
    const { quickLoginAsAffilieDemoAction } = await import('./actions');
    await expect(quickLoginAsAffilieDemoAction()).rejects.toThrow(/super_admin/);
  });
});

describe('quickLoginAsPartenaireDemoAction (P12.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('OK : cookie set + audit + redirect_url', async () => {
    state.settings.set('demo_partenaire_contact_id', 'ct-demo-1');
    state.contacts.set('ct-demo-1', {
      id: 'ct-demo-1',
      email: 'demo@partner.test',
      first_name: 'Demo',
      last_name: 'Partner',
      company_id: 'co-1',
    });
    mockEnv();
    const { quickLoginAsPartenaireDemoAction } = await import('./actions');
    const res = await quickLoginAsPartenaireDemoAction();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirect_url).toBe('/fr/espace-partenaire/dashboard');
    expect(state.cookiesSet[0]?.name).toBe('espace_partenaire_session');
    expect(state.cookiesSet[0]?.value).toBe('fake-contact-token-ct-demo-1');
    expect((state.audit[0]?.row.after as Record<string, unknown>)?.kind).toBe(
      'super_admin_quick_login_partenaire',
    );
  });

  it('Setting demo_partenaire_contact_id non configure → ok:false', async () => {
    mockEnv();
    const { quickLoginAsPartenaireDemoAction } = await import('./actions');
    const res = await quickLoginAsPartenaireDemoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/demo_partenaire_contact_id/);
  });

  it('Contact introuvable en DB → ok:false', async () => {
    state.settings.set('demo_partenaire_contact_id', 'ct-ghost');
    mockEnv();
    const { quickLoginAsPartenaireDemoAction } = await import('./actions');
    const res = await quickLoginAsPartenaireDemoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/);
  });
});
