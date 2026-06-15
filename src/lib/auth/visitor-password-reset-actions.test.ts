/**
 * @vitest-environment node
 *
 * P15.3 — tests consumeVisitorPasswordResetAction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

const scenario = {
  tokenRow: null as {
    token: string;
    visitor_account_id: string;
    expires_at: string;
    used_at: string | null;
  } | null,
};

function reset() {
  updates.length = 0;
  inserts.length = 0;
  scenario.tokenRow = null;
}

function makeFrom(table: string) {
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => {
              if (table === 'visitor_password_reset_tokens')
                return { data: scenario.tokenRow, error: null };
              if (table === 'visitor_accounts')
                return { data: { visitor_id: 'vis-1' }, error: null };
              return { data: null, error: null };
            },
          };
        },
      };
    },
    update(row: Record<string, unknown>) {
      return {
        eq: async () => {
          updates.push({ table, row });
          return { error: null };
        },
      };
    },
    insert(row: Record<string, unknown>) {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeFrom(t) }),
  }));
  vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: vi.fn() }));
  vi.doMock('@/lib/espace-visiteur/accounts', () => ({
    findVisitorAuthByEmail: vi.fn(),
    ensureVisitorAccount: vi.fn(),
  }));
  vi.doMock('./partner-password', () => ({
    hashPassword: vi.fn(async () => 'hashed-pwd'),
    validatePasswordStrength: vi.fn(() => null),
  }));
}

async function load() {
  mockEnv();
  return (await import('./visitor-password-reset-actions')).consumeVisitorPasswordResetAction;
}

const VALID_TOKEN = 'a'.repeat(64);

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('consumeVisitorPasswordResetAction (P15.3)', () => {
  it('token introuvable → token_invalid', async () => {
    scenario.tokenRow = null;
    const consume = await load();
    const res = await consume({ token: VALID_TOKEN, new_password: 'longenough' });
    expect(res).toEqual({ ok: false, error: 'token_invalid' });
  });

  it('token déjà utilisé → token_already_used', async () => {
    scenario.tokenRow = {
      token: VALID_TOKEN,
      visitor_account_id: 'acc-1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: new Date().toISOString(),
    };
    const consume = await load();
    const res = await consume({ token: VALID_TOKEN, new_password: 'longenough' });
    expect(res).toEqual({ ok: false, error: 'token_already_used' });
  });

  it('token valide → ok + password mis à jour + audit consumed', async () => {
    scenario.tokenRow = {
      token: VALID_TOKEN,
      visitor_account_id: 'acc-1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
    };
    const consume = await load();
    const res = await consume({ token: VALID_TOKEN, new_password: 'longenough' });
    expect(res).toEqual({ ok: true });
    const pwUpdate = updates.find(
      (u) => u.table === 'visitor_accounts' && 'password_hash' in u.row,
    );
    expect(pwUpdate?.row.password_hash).toBe('hashed-pwd');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'visitor_password_reset_consumed',
    );
  });
});
