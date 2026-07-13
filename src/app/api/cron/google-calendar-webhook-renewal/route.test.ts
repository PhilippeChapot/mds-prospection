/**
 * @vitest-environment node
 *
 * P14.5 — cron renouvellement webhooks Google : renew + désactivation des
 * connexions mortes (webhook expiré + renew KO → sync_enabled=false).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface TokenRow {
  user_id: string;
  webhook_expires_at: string | null;
  google_account_email?: string | null;
}
interface State {
  tokens: TokenRow[];
  registerOk: Record<string, boolean>;
  updates: Array<{ userId: string; patch: Record<string, unknown> }>;
  auditInserts: Array<Record<string, unknown>>;
  alertEmails: Array<{ category: string; template: Record<string, unknown> }>;
}
const state: State = {
  tokens: [],
  registerOk: {},
  updates: [],
  auditInserts: [],
  alertEmails: [],
};

const PAST = '2026-06-22T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

function mockEnv() {
  vi.doMock('@/lib/admin/calendar/google/tokens-store', () => ({
    listTokensForWebhookRenewal: () => Promise.resolve(state.tokens),
    updateOAuthToken: (userId: string, patch: Record<string, unknown>) => {
      state.updates.push({ userId, patch });
      return Promise.resolve({ ok: true });
    },
  }));
  vi.doMock('@/lib/admin/calendar/google/webhook-manager', () => ({
    registerWebhook: (userId: string) =>
      Promise.resolve(
        state.registerOk[userId]
          ? { ok: true, channelId: 'chan', resourceId: 'res', expiration: FUTURE }
          : { ok: false, error: 'invalid_grant' },
      ),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          state.auditInserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }));
  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: (category: string, template: Record<string, unknown>) => {
      state.alertEmails.push({ category, template });
      return Promise.resolve({
        recipients: ['philippe@mediadays.solutions'],
        delivered: 1,
        failed: 0,
      });
    },
  }));
}

function req(headers: Record<string, string> = {}) {
  return new Request('https://x/api/cron/google-calendar-webhook-renewal', { headers });
}

beforeEach(() => {
  state.tokens = [];
  state.registerOk = {};
  state.updates = [];
  state.auditInserts = [];
  state.alertEmails = [];
  vi.stubEnv('CRON_SECRET', 'secret-123');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cron google-calendar-webhook-renewal (P14.5)', () => {
  it('Bearer invalide → 401', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(req({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('2 candidats renouvelés OK → renewed=2, aucun disable', async () => {
    state.tokens = [
      { user_id: 'u1', webhook_expires_at: FUTURE },
      { user_id: 'u2', webhook_expires_at: PAST },
    ];
    state.registerOk = { u1: true, u2: true };
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(req({ 'x-vercel-cron': '1' }));
    const json = await res.json();
    expect(json.renewed).toBe(2);
    expect(json.disabled).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('webhook DÉJÀ expiré + renew KO → sync_enabled=false (reconnexion requise)', async () => {
    state.tokens = [{ user_id: 'phil', webhook_expires_at: PAST }];
    state.registerOk = { phil: false };
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(req({ 'x-vercel-cron': '1' }));
    const json = await res.json();
    expect(json.disabled).toBe(1);
    expect(state.updates[0].userId).toBe('phil');
    expect(state.updates[0].patch.sync_enabled).toBe(false);
  });

  it('webhook PAS encore expiré + renew KO → transitoire, pas de disable', async () => {
    state.tokens = [{ user_id: 'u1', webhook_expires_at: FUTURE }];
    state.registerOk = { u1: false };
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(req({ 'x-vercel-cron': '1' }));
    const json = await res.json();
    expect(json.errors).toBe(1);
    expect(json.disabled).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('x-vercel-cron seul (pas de CRON_SECRET défini) → autorisé', async () => {
    vi.stubEnv('CRON_SECRET', '');
    state.tokens = [];
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(req({ 'x-vercel-cron': '1' }));
    expect(res.status).toBe(200);
  });

  it('renewal OK → audit_log inséré (action=calendar_webhook_renewed)', async () => {
    state.tokens = [{ user_id: 'u1', webhook_expires_at: FUTURE }];
    state.registerOk = { u1: true };
    mockEnv();
    const { GET } = await import('./route');
    await GET(req({ 'x-vercel-cron': '1' }));
    expect(state.auditInserts).toHaveLength(1);
    expect(state.auditInserts[0]).toMatchObject({
      user_id: 'u1',
      entity_type: 'calendar_oauth_tokens',
      action: 'update',
      after: expect.objectContaining({ kind: 'calendar_webhook_renewed' }),
    });
  });

  it('échec renewal → email alerte Resend envoyé', async () => {
    state.tokens = [
      { user_id: 'u1', webhook_expires_at: FUTURE, google_account_email: 'u1@mds.fr' },
    ];
    state.registerOk = { u1: false };
    mockEnv();
    const { GET } = await import('./route');
    await GET(req({ 'x-vercel-cron': '1' }));
    expect(state.alertEmails).toHaveLength(1);
    expect(state.alertEmails[0].category).toBe('admin_calendar_webhook_renewal_failed');
    expect(state.alertEmails[0].template.subject).toContain('Renouvellement Google Calendar');
  });
});
