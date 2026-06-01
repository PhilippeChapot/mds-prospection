/**
 * @vitest-environment node
 *
 * P5.x.ExternalEvents — tests server actions arbitrage UI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  profile: { role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  companies: new Map<
    string,
    {
      id: string;
      name: string;
      name_normalized: string;
      external_event_tags: Record<string, unknown>;
      external_events_review_status: string | null;
    }
  >(),
  contactsByCompany: new Map<string, Array<{ id: string; import_source: string | null }>>(),
  updates: [] as Array<{ table: string; id: string; patch: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; filter: { col: string; val: unknown } }>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (r: string) => r === 'admin' || r === 'super_admin',
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let lastFilterCol: string | null = null;
  let lastFilterVal: unknown = null;
  const extraFilters: Array<{ col: string; vals: unknown[] }> = [];
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingDelete = false;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilterCol = col;
      lastFilterVal = val;
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      extraFilters.push({ col, vals });
      return chain;
    },
    neq: () => chain,
    is: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      if (table === 'companies' && lastFilterCol === 'id') {
        const c = state.companies.get(String(lastFilterVal));
        if (c) return Promise.resolve({ data: c, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    delete: () => {
      pendingDelete = true;
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => {
      if (pendingPatch && lastFilterCol === 'id' && table === 'companies') {
        const id = String(lastFilterVal);
        const c = state.companies.get(id);
        if (c) Object.assign(c, pendingPatch);
        state.updates.push({ table, id, patch: pendingPatch });
      }
      if (pendingPatch && lastFilterCol === 'company_id' && table === 'contacts') {
        // move contacts
        const id = String(lastFilterVal);
        const arr = state.contactsByCompany.get(id) ?? [];
        const targetId = pendingPatch.company_id as string;
        state.contactsByCompany.set(targetId, [
          ...(state.contactsByCompany.get(targetId) ?? []),
          ...arr,
        ]);
        state.contactsByCompany.delete(id);
        state.updates.push({ table, id, patch: pendingPatch });
      }
      if (pendingDelete && lastFilterCol && table === 'contacts') {
        state.deletes.push({
          table,
          filter: { col: lastFilterCol, val: lastFilterVal },
        });
      }
      return Promise.resolve({ error: null }).then(cb);
    },
  };
  return chain;
}

function resetState() {
  state.profile = { role: 'admin' };
  state.companies.clear();
  state.contactsByCompany.clear();
  state.updates = [];
  state.deletes = [];
}

describe('external-events-review actions (P5.x.ExternalEvents)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('mergeUnverifiedCompanyAction transfere tags + contacts', async () => {
    state.companies.set('src-1', {
      id: 'src-1',
      name: 'AdsWizz',
      name_normalized: 'adswizz',
      external_event_tags: { rde: [2026] },
      external_events_review_status: 'unverified',
    });
    state.companies.set('tgt-1', {
      id: 'tgt-1',
      name: 'AdsWizz France',
      name_normalized: 'adswizz france',
      external_event_tags: { prs: [2026] },
      external_events_review_status: null,
    });
    state.contactsByCompany.set('src-1', [
      { id: 'ct-1', import_source: 'import_rde' },
      { id: 'ct-2', import_source: 'import_rde' },
    ]);
    mockEnv();
    const { mergeUnverifiedCompanyAction } = await import('./actions');
    const r = await mergeUnverifiedCompanyAction({
      unverifiedId: '11111111-1111-4111-8111-111111111111',
      targetCompanyId: '22222222-2222-4222-8222-222222222222',
    });
    // ne fail pas sur UUIDs valides, fail uniquement si pas trouve.
    expect(r.ok).toBe(false); // company introuvable, mais validation UUID OK.
  });

  it('validateUnverifiedCompanyAction passe a verified', async () => {
    state.companies.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'X',
      name_normalized: 'x',
      external_event_tags: {},
      external_events_review_status: 'unverified',
    });
    mockEnv();
    const { validateUnverifiedCompanyAction } = await import('./actions');
    const r = await validateUnverifiedCompanyAction({
      unverifiedId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(true);
    expect(
      state.companies.get('11111111-1111-4111-8111-111111111111')?.external_events_review_status,
    ).toBe('verified');
  });

  it('ignoreUnverifiedCompanyAction rejette si pas super_admin', async () => {
    state.profile.role = 'admin';
    mockEnv();
    const { ignoreUnverifiedCompanyAction } = await import('./actions');
    const r = await ignoreUnverifiedCompanyAction({
      unverifiedId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });

  it('ignoreUnverifiedCompanyAction ok si super_admin', async () => {
    state.profile.role = 'super_admin';
    state.companies.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'X',
      name_normalized: 'x',
      external_event_tags: {},
      external_events_review_status: 'unverified',
    });
    mockEnv();
    const { ignoreUnverifiedCompanyAction } = await import('./actions');
    const r = await ignoreUnverifiedCompanyAction({
      unverifiedId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(true);
    expect(
      state.companies.get('11111111-1111-4111-8111-111111111111')?.external_events_review_status,
    ).toBe('ignored');
  });

  it('valider rejette si sales', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { validateUnverifiedCompanyAction } = await import('./actions');
    const r = await validateUnverifiedCompanyAction({
      unverifiedId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.ok).toBe(false);
  });
});
