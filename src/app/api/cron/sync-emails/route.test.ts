/**
 * @vitest-environment node
 *
 * P12.x.EmailIntegration — auth du cron /api/cron/sync-emails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const syncMock = vi.fn(() =>
  Promise.resolve({ accountId: 'a1', email: 'x', ok: true, fetched: 1, inserted: 1 }),
);

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'a1' }], error: null }) }),
      }),
    }),
  }));
  vi.doMock('@/lib/email/imap-sync', () => ({ syncEmailAccount: syncMock }));
}

beforeEach(() => {
  syncMock.mockClear();
  vi.stubEnv('EMAIL_SYNC_CRON_SECRET', 'secret-123');
});
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('cron sync-emails auth (P12.x)', () => {
  it('Bearer invalide → 401', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x/api/cron/sync-emails', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('sans header → 401', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(new Request('https://x/api/cron/sync-emails'));
    expect(res.status).toBe(401);
  });

  it('Bearer valide → 200 + sync chaque compte', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x/api/cron/sync-emails', {
        headers: { authorization: 'Bearer secret-123' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.accounts).toBe(1);
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('header x-vercel-cron → autorisé', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x/api/cron/sync-emails', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
  });
});
