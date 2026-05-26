/**
 * @vitest-environment node
 *
 * P5.x.Apollo — tests client Apollo (mocks fetch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  apiKeyValue: 'test_api_key_abcdefghijklmnopqrstuvwxyz',
  enabledValue: true as boolean,
  fetchImpl: vi.fn() as ReturnType<typeof vi.fn>,
};

function mockEnv() {
  vi.doMock('@/lib/admin/preferences/get-setting', () => ({
    getSetting: vi.fn(async (key: string, defaultValue?: unknown) => {
      if (key === 'apollo_api_key') return state.apiKeyValue ?? defaultValue;
      if (key === 'apollo_enabled') return state.enabledValue ?? defaultValue;
      return defaultValue;
    }),
  }));
  vi.stubGlobal('fetch', state.fetchImpl);
}

describe('apolloOrganizationEnrich (P5.x.Apollo)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.apiKeyValue = 'test_api_key_abcdefghijklmnopqrstuvwxyz';
    state.enabledValue = true;
    state.fetchImpl = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clé API manquante -> throw ApolloError', async () => {
    state.apiKeyValue = '';
    mockEnv();
    const { apolloOrganizationEnrich, ApolloError } = await import('./client');
    await expect(apolloOrganizationEnrich('tf1pub.fr')).rejects.toBeInstanceOf(ApolloError);
  });

  it('HTTP 200 + organization présent -> retourne l’org', async () => {
    state.fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        organization: {
          id: 'apollo-id-123',
          name: 'TF1 PUB',
          website_url: 'https://www.tf1pub.fr',
          estimated_num_employees: 380,
        },
      }),
    });
    mockEnv();
    const { apolloOrganizationEnrich } = await import('./client');
    const org = await apolloOrganizationEnrich('tf1pub.fr');
    expect(org?.id).toBe('apollo-id-123');
    expect(org?.estimated_num_employees).toBe(380);
  });

  it('HTTP 200 + organization=null -> retourne null (no match)', async () => {
    state.fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ organization: null }),
    });
    mockEnv();
    const { apolloOrganizationEnrich } = await import('./client');
    const org = await apolloOrganizationEnrich('inexistant-xyz-12345.fr');
    expect(org).toBeNull();
  });

  it('HTTP 5xx -> throw ApolloError avec status', async () => {
    state.fetchImpl.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error_message: 'Bad gateway' }),
    });
    mockEnv();
    const { apolloOrganizationEnrich, ApolloError } = await import('./client');
    try {
      await apolloOrganizationEnrich('tf1pub.fr');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApolloError);
      expect((err as InstanceType<typeof ApolloError>).status).toBe(502);
    }
  });

  it('isApolloEnabled : enabled=false -> false même si clé présente', async () => {
    state.enabledValue = false;
    mockEnv();
    const { isApolloEnabled } = await import('./client');
    expect(await isApolloEnabled()).toBe(false);
  });

  it('isApolloEnabled : enabled=true + clé vide -> false', async () => {
    state.apiKeyValue = '';
    state.enabledValue = true;
    mockEnv();
    const { isApolloEnabled } = await import('./client');
    expect(await isApolloEnabled()).toBe(false);
  });

  it('isLikelyDomain detect domaines vs noms', async () => {
    mockEnv();
    const { isLikelyDomain } = await import('./client');
    expect(isLikelyDomain('tf1pub.fr')).toBe(true);
    expect(isLikelyDomain('dailymotion.com')).toBe(true);
    expect(isLikelyDomain('sub.dailymotion.com')).toBe(true);
    expect(isLikelyDomain('TF1 PUB')).toBe(false);
    expect(isLikelyDomain('a')).toBe(false);
    expect(isLikelyDomain('société française')).toBe(false);
  });
});
