/**
 * @vitest-environment node
 *
 * P5.x.CompaniesAddressAndTags — tests updateCompanyExternalEventTagsAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  profile: { id: 'u-1', role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  company: null as Record<string, unknown> | null,
  updates: [] as Array<{ patch: Record<string, unknown> }>,
  audits: [] as Record<string, unknown>[],
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
    external_event_tags: { prs: [2026] },
  };
  state.updates = [];
  state.audits = [];
}

describe('updateCompanyExternalEventTagsAction (P5.x.CompaniesAddressAndTags)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('save tags valides → patch DB + audit', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    const r = await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [2026], mediadays_classic: [2023, 2025] },
    });
    expect(r.ok).toBe(true);
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.external_event_tags).toEqual({ prs: [2026], mediadays_classic: [2023, 2025] });
    // Audit
    expect(state.audits).toHaveLength(1);
    expect((state.audits[0].after as Record<string, unknown>).kind).toBe(
      'company_external_event_tags_updated',
    );
  });

  it('rejette key non-whitelistee (ex: random_event)', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    const r = await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [2026], random_event: [2025] },
    });
    // L'action passe MAIS la key random est filtrée
    expect(r.ok).toBe(true);
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.external_event_tags).toEqual({ prs: [2026] });
  });

  it('rejette annee hors range (ex: 2050)', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    const r = await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [2050] },
    });
    expect(r.ok).toBe(false);
  });

  it('Years vides -> key supprimee du patch', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [], mediadays_classic: [2024] },
    });
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.external_event_tags).toEqual({ mediadays_classic: [2024] });
  });

  it('Sales rejette (RBAC strict)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    const r = await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [2026] },
    });
    expect(r.ok).toBe(false);
  });

  it('Super_admin OK', async () => {
    state.profile.role = 'super_admin';
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    const r = await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { satis: [2025] },
    });
    expect(r.ok).toBe(true);
  });

  it('Dedup + sort des annees', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { mediadays_classic: [2025, 2023, 2025, 2024] },
    });
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect((patch.external_event_tags as Record<string, unknown>).mediadays_classic).toEqual([
      2023, 2024, 2025,
    ]);
  });

  it('Audit log inclut before + after.kind', async () => {
    mockEnv();
    const { updateCompanyExternalEventTagsAction } = await import('./tags-actions');
    await updateCompanyExternalEventTagsAction({
      company_id: '11111111-1111-4111-8111-111111111111',
      tags: { prs: [2026], cbd: [2025] },
    });
    const audit = state.audits[0];
    expect(audit.before).toEqual({ external_event_tags: { prs: [2026] } });
    expect((audit.after as Record<string, unknown>).kind).toBe(
      'company_external_event_tags_updated',
    );
  });
});
