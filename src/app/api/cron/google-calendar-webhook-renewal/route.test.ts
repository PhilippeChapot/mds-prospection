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
}
interface State {
  tokens: TokenRow[];
  registerOk: Record<string, boolean>;
  updates: Array<{ userId: string; patch: Record<string, unknown> }>;
}
const state: State = { tokens: [], registerOk: {}, updates: [] };

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
        state.registerOk[userId] ? { ok: true } : { ok: false, error: 'invalid_grant' },
      ),
  }));
}

function req(headers: Record<string, string> = {}) {
  return new Request('https://x/api/cron/google-calendar-webhook-renewal', { headers });
}

beforeEach(() => {
  state.tokens = [];
  state.registerOk = {};
  state.updates = [];
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
});
