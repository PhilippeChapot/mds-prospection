/**
 * @vitest-environment node
 *
 * P15.3 — tests loginVisitorWithPasswordAction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieSet = vi.fn();
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

const scenario = {
  account: null as { id: string; visitor_id: string; password_hash: string | null } | null,
  passwordValid: true,
};

function reset() {
  cookieSet.mockClear();
  inserts.length = 0;
  scenario.account = null;
  scenario.passwordValid = true;
}

function mockEnv() {
  vi.doMock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
  vi.doMock('@/lib/espace-visiteur/jwt', () => ({
    signLongVisitorSessionToken: vi.fn(async () => 'session-token'),
    ESPACE_VISITEUR_SESSION_COOKIE: 'espace_visiteur_session',
    ESPACE_VISITEUR_SESSION_LONG_MAX_AGE: 2592000,
  }));
  vi.doMock('@/lib/espace-visiteur/session', () => ({ requireVisitorSession: vi.fn() }));
  vi.doMock('@/lib/espace-visiteur/accounts', () => ({
    getVisitorAccountByEmail: vi.fn(async () => scenario.account),
  }));
  vi.doMock('./partner-password', () => ({
    verifyPassword: vi.fn(async () => scenario.passwordValid),
    hashPassword: vi.fn(async () => 'hashed'),
    validatePasswordStrength: vi.fn(() => null),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => ({
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }));
}

async function load() {
  mockEnv();
  return (await import('./visitor-password-actions')).loginVisitorWithPasswordAction;
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('loginVisitorWithPasswordAction (P15.3)', () => {
  it('compte inexistant → invalid_credentials', async () => {
    scenario.account = null;
    const login = await load();
    const res = await login({ email: 'x@y.fr', password: 'whatever' });
    expect(res).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('mot de passe correct → ok + cookie session posé + audit login', async () => {
    scenario.account = { id: 'acc-1', visitor_id: 'vis-1', password_hash: '$2a$12$hash' };
    scenario.passwordValid = true;
    const login = await load();
    const res = await login({ email: 'x@y.fr', password: 'goodpass' });
    expect(res).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledWith(
      'espace_visiteur_session',
      'session-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('visitor_password_login');
  });

  it('mauvais mot de passe → invalid_credentials', async () => {
    scenario.account = { id: 'acc-1', visitor_id: 'vis-1', password_hash: '$2a$12$hash' };
    scenario.passwordValid = false;
    const login = await load();
    const res = await login({ email: 'x@y.fr', password: 'wrong' });
    expect(res).toEqual({ ok: false, error: 'invalid_credentials' });
  });
});
