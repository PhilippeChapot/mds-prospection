/**
 * @vitest-environment node
 *
 * P14.2.SalesCalendarGoogleSync — tests persistPushResult (PUSH).
 *
 * Couvre : succès→synced + champs Google/meet, échec réel→pending_push,
 * non-connecté→aucun flag (rien à pousser).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  updates: Array<Record<string, unknown>>;
}
const state: MockState = { updates: [] };

function makeClient() {
  return {
    from() {
      return {
        update(fields: Record<string, unknown>) {
          return {
            eq: (_col: string, id: string) => {
              state.updates.push({ id, ...fields });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeClient() }));
}

describe('persistPushResult (P14.2 PUSH)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.updates.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('succès → sync_status=synced + persiste google id/etag/meet', async () => {
    mockEnv();
    const { persistPushResult } = await import('./push-sync');
    await persistPushResult('ev-1', {
      ok: true,
      googleEventId: 'g-1',
      etag: 'etag-1',
      meetUrl: 'https://meet.google.com/xyz',
      meetConferenceId: 'conf-1',
    });
    expect(state.updates).toHaveLength(1);
    const u = state.updates[0];
    expect(u.id).toBe('ev-1');
    expect(u.sync_status).toBe('synced');
    expect(u.google_calendar_event_id).toBe('g-1');
    expect(u.google_etag).toBe('etag-1');
    expect(u.meet_url).toBe('https://meet.google.com/xyz');
    expect(u.meet_conference_id).toBe('conf-1');
  });

  it('échec réel (API) → sync_status=pending_push (retry cron)', async () => {
    mockEnv();
    const { persistPushResult } = await import('./push-sync');
    await persistPushResult('ev-2', { ok: false, error: 'Google 503' });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].sync_status).toBe('pending_push');
  });

  it('non connecté → aucun flag (rien à pousser)', async () => {
    mockEnv();
    const { persistPushResult } = await import('./push-sync');
    await persistPushResult('ev-3', { ok: false, error: 'not_connected_or_disabled' });
    expect(state.updates).toHaveLength(0);
  });
});
