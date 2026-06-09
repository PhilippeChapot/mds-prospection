/**
 * @vitest-environment node
 *
 * P14.2 #9 — tests sendUpdates + attendees dans pushEventToGoogle.
 *
 * Couvre :
 *   - event avec attendees → sendUpdates='all'
 *   - event sans attendees → sendUpdates='none'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CalendarEventRow } from '../helpers';

interface CallRecord {
  method: 'insert' | 'update';
  params: Record<string, unknown>;
}
const state = {
  calls: [] as CallRecord[],
  returnData: { id: 'g-new', etag: 'etag-1', hangoutLink: null, conferenceData: null },
};

function makeCalendarMock() {
  return {
    events: {
      insert: vi.fn(async (params: Record<string, unknown>) => {
        state.calls.push({ method: 'insert', params });
        return { data: state.returnData };
      }),
      update: vi.fn(async (params: Record<string, unknown>) => {
        state.calls.push({ method: 'update', params });
        return { data: state.returnData };
      }),
    },
  };
}

const calMock = makeCalendarMock();

function mockDeps() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    }),
  }));
  vi.doMock('./tokens-store', () => ({
    getOAuthToken: vi.fn().mockResolvedValue({
      user_id: 'u1',
      sync_enabled: true,
      google_calendar_id: 'primary',
      encrypted_refresh_token: 'enc',
    }),
  }));
  vi.doMock('./oauth-client', () => ({
    getAuthenticatedClientForUser: vi.fn().mockResolvedValue({
      auth: {},
      calendarId: 'primary',
    }),
    calendarClient: vi.fn().mockReturnValue(calMock.events ? calMock : makeCalendarMock()),
  }));
}

const BASE_EVENT: CalendarEventRow = {
  id: 'ev-1',
  user_id: 'u1',
  prospect_id: null,
  event_type: 'meeting',
  status: 'pending',
  priority: 'normal',
  title: 'Test meeting',
  description: null,
  location: null,
  start_at: '2026-06-15T10:00:00Z',
  end_at: '2026-06-15T11:00:00Z',
  is_all_day: false,
  duration_minutes: 60,
  outcome: null,
  reminder_15min_sent_at: null,
  reminder_1h_sent_at: null,
  reminder_24h_sent_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  created_by_user_id: 'u1',
  google_calendar_event_id: null,
  google_calendar_synced_at: null,
  attendees: [],
};

describe('pushEventToGoogle — sendUpdates (P14.2 #9)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.calls.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('event avec attendees → sendUpdates=all dans appel Google', async () => {
    mockDeps();
    const { pushEventToGoogle } = await import('./push-sync');
    const event: CalendarEventRow = {
      ...BASE_EVENT,
      attendees: [
        { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'needsAction' },
        { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'needsAction' },
      ],
    };
    await pushEventToGoogle(event, false);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].params.sendUpdates).toBe('all');
  });

  it('event sans attendees → sendUpdates=none dans appel Google', async () => {
    mockDeps();
    const { pushEventToGoogle } = await import('./push-sync');
    const event: CalendarEventRow = { ...BASE_EVENT, attendees: [] };
    await pushEventToGoogle(event, false);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].params.sendUpdates).toBe('none');
  });
});
