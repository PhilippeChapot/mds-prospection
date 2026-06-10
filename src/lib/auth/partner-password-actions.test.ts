/**
 * P11.x — tests loginPartnerWithPasswordAction + setPartnerPasswordAction.
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

const state = {
  contactEmail: 'alice@acme.com',
  contactId: '11111111-1111-1111-8111-111111111111',
  passwordHash: null as string | null,
};

function makeClient() {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        ilike: () => chain,
        eq: () => chain,
        limit: () => chain,
        update: () => chain,
        insert: () => Promise.resolve({ error: null }),
        maybeSingle: () => {
          if (table === 'contacts') {
            return Promise.resolve({
              data: {
                id: state.contactId,
                email: state.contactEmail,
                password_hash: state.passwordHash,
              },
            });
          }
          return Promise.resolve({ data: null });
        },
      };
      return chain;
    },
  };
}

function mockDeps() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/espace-partenaire/jwt', () => ({
    signLongContactSessionToken: vi.fn().mockResolvedValue('mock-session-token'),
    ESPACE_EXPOSANT_SESSION_COOKIE: 'espace_partenaire_session',
    ESPACE_EXPOSANT_SESSION_LONG_MAX_AGE: 2592000,
  }));
  vi.doMock('next/headers', () => ({
    cookies: () =>
      Promise.resolve({
        set: vi.fn(),
      }),
  }));
  vi.doMock('@/lib/espace-partenaire/session', () => ({
    requireContactSession: vi.fn().mockResolvedValue({ contactId: state.contactId }),
  }));
}

describe('loginPartnerWithPasswordAction (P11.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.passwordHash = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('retourne ok:true avec les bons identifiants', async () => {
    state.passwordHash = await bcrypt.hash('correct-password', 4); // cost=4 pour les tests
    mockDeps();
    const { loginPartnerWithPasswordAction } = await import('./partner-password-actions');
    const result = await loginPartnerWithPasswordAction({
      email: state.contactEmail,
      password: 'correct-password',
    });
    expect(result.ok).toBe(true);
  });

  it('retourne ok:false avec un mauvais mot de passe', async () => {
    state.passwordHash = await bcrypt.hash('correct', 4);
    mockDeps();
    const { loginPartnerWithPasswordAction } = await import('./partner-password-actions');
    const result = await loginPartnerWithPasswordAction({
      email: state.contactEmail,
      password: 'wrong-password',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_credentials');
  });

  it('retourne ok:false si aucun password set (magic link only)', async () => {
    state.passwordHash = null; // pas de password
    mockDeps();
    const { loginPartnerWithPasswordAction } = await import('./partner-password-actions');
    const result = await loginPartnerWithPasswordAction({
      email: state.contactEmail,
      password: 'any-password',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_credentials');
  });
});

describe('setPartnerPasswordAction (P11.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.passwordHash = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('requiert le mot de passe actuel si déjà un hash', async () => {
    state.passwordHash = await bcrypt.hash('old-password', 4);
    mockDeps();
    const { setPartnerPasswordAction } = await import('./partner-password-actions');
    const result = await setPartnerPasswordAction('fr', {
      new_password: 'new-password-ok',
      // current_password manquant
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('current_password_required');
  });
});
