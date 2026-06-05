/**
 * @vitest-environment node
 *
 * P5.x.CompaniesAddressAndTags + P5.x.ConnectOnAirDirectoryCache
 *
 * Tests :
 *   - enrichCompanyAddressFromApolloAction (refactor pour utiliser helper)
 *   - enrichCompanyAddressFromConnectOnAirAction (cache local DB)
 *   - enrichCompanyAddressAction (cascade CoA -> Apollo)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type CompanyState = Record<string, unknown> | null;
type DirectoryRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
};

const state = {
  profile: { id: 'u-1', role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  company: null as CompanyState,
  // After update is applied, we mutate `company` to reflect the new state.
  updates: [] as Array<{ patch: Record<string, unknown> }>,
  audits: [] as Record<string, unknown>[],
  apolloResult: null as Record<string, unknown> | null,
  apolloShouldThrow: false,
  // ConnectOnAir cache : matches keyed by normalized_name eq or ilike pattern.
  coaByNormalizedName: new Map<string, DirectoryRow>(),
  coaByIlike: new Map<string, DirectoryRow>(),
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
  let lastFilterCol: string | null = null;
  let lastFilterVal: unknown = null;
  let lastIlikeCol: string | null = null;
  let lastIlikeVal: unknown = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilterCol = col;
      lastFilterVal = val;
      return chain;
    },
    ilike: (col: string, val: unknown) => {
      lastIlikeCol = col;
      lastIlikeVal = val;
      return chain;
    },
    limit: () => {
      if (table === 'connectonair_directory') {
        if (lastFilterCol === 'normalized_name') {
          const row = state.coaByNormalizedName.get(String(lastFilterVal));
          return Promise.resolve({ data: row ? [row] : [], error: null });
        }
        if (lastIlikeCol === 'normalized_name') {
          // Strip % wildcards.
          const key = String(lastIlikeVal).replace(/%/g, '');
          const row = state.coaByIlike.get(key);
          return Promise.resolve({ data: row ? [row] : [], error: null });
        }
      }
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle: () => {
      if (table === 'companies' && lastFilterCol === 'id') {
        return Promise.resolve({ data: state.company, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      if (table === 'audit_log') state.audits.push(row);
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => {
      if (pendingPatch && table === 'companies' && lastFilterCol === 'id') {
        state.updates.push({ patch: pendingPatch });
        // Reflect mutation back into state.company so subsequent reads see it.
        if (state.company) {
          for (const [k, v] of Object.entries(pendingPatch)) {
            if (k !== 'last_enrichment_source' && k !== 'last_enriched_at' && k !== 'updated_at') {
              (state.company as Record<string, unknown>)[k] = v;
            }
          }
        }
      }
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
  state.coaByNormalizedName.clear();
  state.coaByIlike.clear();
}

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

// ───────────────────────────────────────────────────────────────────────
// Apollo (refactor)
// ───────────────────────────────────────────────────────────────────────

describe('enrichCompanyAddressFromApolloAction (refactor via helper)', () => {
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
    const r = await enrichCompanyAddressFromApolloAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
  });

  it('Apollo retourne adresse → patch sans ecraser non-vide + last_enrichment_source set', async () => {
    (state.company as Record<string, unknown>).city = 'Paris';
    state.apolloResult = {
      raw_address: '4 rue Blaise Pascal',
      city: 'Lyon', // ne doit PAS ecraser
      postal_code: '78990',
      country: 'FR',
      primary_phone: { sanitized_number: '+33123456789' },
      industry: 'Marketing',
    };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.raw_address).toBe('4 rue Blaise Pascal');
    expect(patch.city).toBeUndefined();
    expect(patch.postal_code).toBe('78990');
    expect(patch.last_enrichment_source).toBe('apollo');
    expect(patch.last_enriched_at).toBeTruthy();
  });

  it('Tous champs deja remplis → ok:false (rien a appliquer)', async () => {
    state.company = {
      ...(state.company as Record<string, unknown>),
      raw_address: '1 rue Test',
      city: 'Paris',
      postal_code: '75008',
      country: 'FR',
      phone: '+33',
      industry: 'X',
      linkedin_url: 'https://linkedin.com/x',
    };
    state.apolloResult = { raw_address: 'Other', city: 'Other' };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromApolloAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('Audit log inclut kind=company_apollo_enrich_address', async () => {
    state.apolloResult = { city: 'Paris', postal_code: '75008' };
    mockEnv();
    const { enrichCompanyAddressFromApolloAction } = await import('./enrich-actions');
    await enrichCompanyAddressFromApolloAction({ company_id: COMPANY_ID });
    const audit = state.audits[0];
    expect((audit.after as Record<string, unknown>).kind).toBe('company_apollo_enrich_address');
  });
});

// ───────────────────────────────────────────────────────────────────────
// ConnectOnAir cache (new)
// ───────────────────────────────────────────────────────────────────────

describe('enrichCompanyAddressFromConnectOnAirAction (cache local DB)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Match strict sur normalized_name → applique + last_enrichment_source=connectonair', async () => {
    // Acme -> normalizeNameJs('Acme') = 'ACME'
    state.coaByNormalizedName.set('ACME', {
      id: 'coa-1',
      name: 'Acme Radio',
      address: '12 rue de la Radio',
      city: 'Paris',
      postal_code: '75016',
      country: 'FR',
      phone: '+33147000000',
      website: 'https://acme-radio.fr',
    });
    mockEnv();
    const { enrichCompanyAddressFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromConnectOnAirAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('connectonair');
      expect(r.matchName).toBe('Acme Radio');
    }
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.raw_address).toBe('12 rue de la Radio');
    expect(patch.last_enrichment_source).toBe('connectonair');
  });

  it('Pas de match strict → fallback ILIKE fuzzy', async () => {
    // Note: state.coaByNormalizedName est vide ; on alimente coaByIlike pour le fallback.
    state.coaByIlike.set('ACME', {
      id: 'coa-fuzzy',
      name: 'Acme Audio SAS',
      address: 'Addr',
      city: 'Lyon',
      postal_code: '69000',
      country: 'FR',
      phone: null,
      website: null,
    });
    mockEnv();
    const { enrichCompanyAddressFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromConnectOnAirAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matchName).toBe('Acme Audio SAS');
  });

  it('Aucun match (strict + fuzzy vides) → ok:false', async () => {
    mockEnv();
    const { enrichCompanyAddressFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromConnectOnAirAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.source).toBe('connectonair');
      expect(r.error).toMatch(/Aucune correspondance/);
    }
  });

  it('Match mais tous champs deja remplis → ok:false avec matchName', async () => {
    state.company = {
      ...(state.company as Record<string, unknown>),
      raw_address: 'X',
      city: 'X',
      postal_code: 'X',
      country: 'FR',
      phone: 'X',
    };
    state.coaByNormalizedName.set('ACME', {
      id: 'coa-1',
      name: 'Acme Radio',
      address: '12 rue de la Radio',
      city: 'Paris',
      postal_code: '75016',
      country: 'FR',
      phone: null,
      website: null,
    });
    mockEnv();
    const { enrichCompanyAddressFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressFromConnectOnAirAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.matchName).toBe('Acme Radio');
  });

  it('Audit log kind=company_connectonair_enrich_address', async () => {
    state.coaByNormalizedName.set('ACME', {
      id: 'coa-1',
      name: 'Acme Radio',
      address: '12 rue de la Radio',
      city: null,
      postal_code: null,
      country: 'FR',
      phone: null,
      website: null,
    });
    mockEnv();
    const { enrichCompanyAddressFromConnectOnAirAction } = await import('./enrich-actions');
    await enrichCompanyAddressFromConnectOnAirAction({ company_id: COMPANY_ID });
    expect((state.audits[0]?.after as Record<string, unknown>)?.kind).toBe(
      'company_connectonair_enrich_address',
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// Cascade CoA -> Apollo
// ───────────────────────────────────────────────────────────────────────

describe('enrichCompanyAddressAction (cascade CoA -> Apollo)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('CoA success → cascadeUsed=["connectonair"] (Apollo non appele)', async () => {
    state.coaByNormalizedName.set('ACME', {
      id: 'coa-1',
      name: 'Acme Radio',
      address: '12 rue de la Radio',
      city: 'Paris',
      postal_code: '75016',
      country: 'FR',
      phone: null,
      website: null,
    });
    state.apolloResult = { raw_address: 'NEVER CALLED' };
    mockEnv();
    const { enrichCompanyAddressAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('connectonair');
      expect(r.cascadeUsed).toEqual(['connectonair']);
    }
  });

  it('CoA fail + Apollo success → cascadeUsed=["connectonair","apollo"]', async () => {
    // coaByNormalizedName vide -> CoA fail.
    state.apolloResult = {
      raw_address: 'Apollo addr',
      city: 'Paris',
      postal_code: '75008',
      country: 'FR',
    };
    mockEnv();
    const { enrichCompanyAddressAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('apollo');
      expect(r.cascadeUsed).toEqual(['connectonair', 'apollo']);
    }
  });

  it('Les 2 sources echouent → ok:false avec coaError + apolloError', async () => {
    state.apolloResult = null;
    mockEnv();
    const { enrichCompanyAddressAction } = await import('./enrich-actions');
    const r = await enrichCompanyAddressAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.source).toBe('none');
      expect(r.cascadeUsed).toEqual(['connectonair', 'apollo']);
      expect(r.coaError).toBeTruthy();
      expect(r.apolloError).toBeTruthy();
    }
  });
});
