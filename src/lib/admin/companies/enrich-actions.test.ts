/**
 * @vitest-environment node
 *
 * P5.x.CompaniesAddressAndTags — tests enrichCompanyAddressFromApolloAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  profile: { id: 'u-1', role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  company: null as Record<string, unknown> | null,
  updates: [] as Array<{ patch: Record<string, unknown> }>,
  audits: [] as Record<string, unknown>[],
  apolloResult: null as Record<string, unknown> | null,
  apolloShouldThrow: false,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (r: string) => r === 'admin' || r === 'super_admin',
  }));
  vi.doMock('@/lib/utils/domain', () => ({
    normalizeDomain: (s: string) =>
      s
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0],
  }));
  vi.doMock('@/lib/apollo/client', () => ({
    apolloOrganizationEnrich: vi.fn(async () => {
      if (state.apolloShouldThrow) throw new Error('Apollo down');
      return state.apolloResult;
    }),
    ApolloError: class ApolloError extends Error {},
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | null = null;
  let lastFilter: { col: string; val: unknown } | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilter = { col, val };
      return chain;
    },
    maybeSingle: () => {
      if (table === 'companies' && lastFilter?.col === 'id') {
        return Promise.resolve({ data: state.company, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'audit_log') state.audits.push(row);
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => {
      if (pendingPatch && table === 'companies' && lastFilter?.col === 'id') {
        state.updates.push({ patch: pendingPatch });
      }
      void pendingInsert;
      return Promise.resolve({ error: null }).then(cb);
    },
  };
  return chain;
}

function resetState() {
  state.profile = { id: 'u-1', role: 'admin' };
  state.company = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Acme',
    website: 'https://acme.com',
    primary_domain: 'acme.com',
    raw_address: null,
    city: null,
    postal_code: null,
    country: null,
    phone: null,
    industry: null,
    linkedin_url: null,
  };
  state.updates = [];
  state.audits = [];
  state.apolloResult = null;
  state.apolloShouldThrow = false;
}

describe('enrichCompanyAddressFromApolloAction (P5.x.CompaniesAddressAndTags)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Sales rejette (RBAC)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });

  it('Pas de website ni primary_domain → rejette', async () => {
    state.company!.website = null;
    state.company!.primary_domain = null;
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });

  it('Apollo retourne adresse → patch DB sans ecraser non-vide', async () => {
    state.company!.city = 'Paris'; // déjà rempli, ne doit PAS être écrasé
    state.apolloResult = {
      raw_address: '4 rue Blaise Pascal',
      city: 'Lyon', // Apollo dit Lyon mais on a déjà Paris → NE PAS écraser
      postal_code: '78990',
      country: 'France',
      primary_phone: { sanitized_number: '+33123456789' },
      industry: 'Marketing',
    };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(true);
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    // raw_address rempli
    expect(patch.raw_address).toBe('4 rue Blaise Pascal');
    // city NON modifié (Paris déjà présent)
    expect(patch.city).toBeUndefined();
    // postal_code rempli
    expect(patch.postal_code).toBe('78990');
    expect(patch.country).toBe('France');
    expect(patch.phone).toBe('+33123456789');
    expect(patch.industry).toBe('Marketing');
    if (r.ok) {
      expect(r.data?.fieldsUpdated).not.toContain('city');
      expect(r.data?.fieldsUpdated).toContain('raw_address');
    }
  });

  it('Apollo retourne null → ok:false', async () => {
    state.apolloResult = null;
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });

  it('Apollo throw → ok:false', async () => {
    state.apolloShouldThrow = true;
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });

  it('Tous champs deja remplis → fieldsUpdated=[]', async () => {
    state.company = {
      ...state.company!,
      raw_address: '1 rue Test',
      city: 'Paris',
      postal_code: '75008',
      country: 'France',
      phone: '+33',
      industry: 'X',
      linkedin_url: 'https://linkedin.com/x',
    };
    state.apolloResult = {
      raw_address: 'Other',
      city: 'Other',
      postal_code: 'Other',
    };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.fieldsUpdated).toEqual([]);
    }
    expect(state.updates).toHaveLength(0);
  });

  it('Audit log inclut kind=company_apollo_enrich_address', async () => {
    state.apolloResult = { city: 'Paris', postal_code: '75008' };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    await enrichCompanyAddressFromApolloAction({
      company_id: '11111111-1111-4111-8111-111111111111',
    });
    const audit = state.audits[0];
    expect((audit.after as Record<string, unknown>).kind).toBe('company_apollo_enrich_address');
  });
});
