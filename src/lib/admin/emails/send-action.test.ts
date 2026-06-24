/**
 * @vitest-environment node
 *
 * P12.x.EmailIntegration — sendEmailAction (ownership + Zod + audit).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  profileId: string;
  account: { id: string; user_id: string; is_active: boolean } | null;
  sendResult: { ok: true; emailId: string; messageId: string } | { ok: false; error: string };
  audits: Array<Record<string, unknown>>;
}
const state: State = {
  profileId: 'u1',
  account: null,
  sendResult: { ok: true, emailId: 'em-1', messageId: 'mid-1' },
  audits: [],
};

const ACC = '11111111-1111-4111-8111-111111111111';

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve({ id: state.profileId, role: 'admin', email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/email/smtp-send', () => ({
    sendEmailFromAccount: vi.fn(() => Promise.resolve(state.sendResult)),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'email_accounts') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.account }) }),
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.audits.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

const valid = {
  account_id: ACC,
  to: ['client@acme.fr'],
  subject: 'Bonjour',
  body_html: '<p>Hello</p>',
};

beforeEach(() => {
  state.profileId = 'u1';
  state.account = { id: ACC, user_id: 'u1', is_active: true };
  state.sendResult = { ok: true, emailId: 'em-1', messageId: 'mid-1' };
  state.audits = [];
});
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('sendEmailAction (P12.x)', () => {
  it('happy → envoi + audit email_sent', async () => {
    mockEnv();
    const { sendEmailAction } = await import('./send-action');
    const r = await sendEmailAction(valid);
    expect(r.ok).toBe(true);
    expect((state.audits[0].after as { kind: string }).kind).toBe('email_sent');
  });

  it('compte d’un autre user → refusé', async () => {
    state.account = { id: ACC, user_id: 'autre-user', is_active: true };
    mockEnv();
    const { sendEmailAction } = await import('./send-action');
    const r = await sendEmailAction(valid);
    expect(r.ok).toBe(false);
    expect(state.audits).toHaveLength(0);
  });

  it('compte inactif → refusé', async () => {
    state.account = { id: ACC, user_id: 'u1', is_active: false };
    mockEnv();
    const { sendEmailAction } = await import('./send-action');
    const r = await sendEmailAction(valid);
    expect(r.ok).toBe(false);
  });

  it('sans destinataire → erreur Zod', async () => {
    mockEnv();
    const { sendEmailAction } = await import('./send-action');
    const r = await sendEmailAction({ ...valid, to: [] });
    expect(r.ok).toBe(false);
  });

  it('échec SMTP → ok:false, pas d’audit', async () => {
    state.sendResult = { ok: false, error: 'smtp down' };
    mockEnv();
    const { sendEmailAction } = await import('./send-action');
    const r = await sendEmailAction(valid);
    expect(r.ok).toBe(false);
    expect(state.audits).toHaveLength(0);
  });
});
