/**
 * @vitest-environment node
 *
 * P5.x.CompanyNewApolloEnrich — enrichCompanyFromApolloAction (flag, domaine,
 * match / no-match).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  enabled: boolean;
  org: Record<string, unknown> | null;
  audits: number;
}
const state: State = { enabled: true, org: null, audits: 0 };

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'u1', role: 'admin', email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));
  vi.doMock('@/lib/apollo/client', () => ({
    isApolloEnabled: () => Promise.resolve(state.enabled),
    apolloOrganizationEnrich: () => Promise.resolve(state.org),
    ApolloError: class extends Error {},
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () =>
      Promise.resolve({
        from: () => ({
          insert: () => {
            state.audits += 1;
            return Promise.resolve({ error: null });
          },
        }),
      }),
  }));
}

beforeEach(() => {
  state.enabled = true;
  state.org = null;
  state.audits = 0;
});
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('enrichCompanyFromApolloAction (P5.x)', () => {
  it('Apollo désactivé → reason disabled', async () => {
    state.enabled = false;
    mockEnv();
    const { enrichCompanyFromApolloAction } = await import('./actions');
    const r = await enrichCompanyFromApolloAction('acme.fr');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('disabled');
  });

  it('nom seul (pas de domaine) → reason need_domain, pas d’appel Apollo', async () => {
    mockEnv();
    const { enrichCompanyFromApolloAction } = await import('./actions');
    const r = await enrichCompanyFromApolloAction('Podcast Magazine');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('need_domain');
  });

  it('domaine + match → mapping + audit', async () => {
    state.org = { id: 'org-1', name: 'Acme', primary_domain: 'acme.fr', country: 'France' };
    mockEnv();
    const { enrichCompanyFromApolloAction } = await import('./actions');
    const r = await enrichCompanyFromApolloAction('acme.fr');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.match?.name).toBe('Acme');
      expect(r.match?.country).toBe('FR');
    }
    expect(state.audits).toBe(1);
  });

  it('domaine + aucun match → match null, pas d’audit', async () => {
    state.org = null;
    mockEnv();
    const { enrichCompanyFromApolloAction } = await import('./actions');
    const r = await enrichCompanyFromApolloAction('azertyqwerty.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.match).toBeNull();
    expect(state.audits).toBe(0);
  });
});
