/**
 * @vitest-environment node
 *
 * P14.1.SalesCalendarCore (Commit 4) — tests cron handler reminders.
 *
 * Couvre :
 *   - Auth : 401 si pas de Bearer ni x-vercel-cron.
 *   - Priorise la fenetre 15min > 1h > 24h.
 *   - Idempotent : 2e run ne re-envoie pas si flag deja set.
 *   - Skip events status cancelled/done.
 *   - Stats correctes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type StoredEvent = {
  id: string;
  user_id: string;
  prospect_id: string | null;
  event_type: 'call_relance' | 'meeting' | 'task';
  status: 'pending' | 'done' | 'cancelled' | 'missed';
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  priority: 'low' | 'normal' | 'high';
  duration_minutes: number | null;
  outcome: string | null;
  reminder_15min_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  reminder_24h_sent_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  google_calendar_event_id: string | null;
  google_calendar_synced_at: string | null;
};

const state = {
  events: [] as StoredEvent[],
  sentReminders: [] as Array<{ eventId: string; kind: string }>,
};

function mockEnv() {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/admin/calendar/reminders-helper', () => ({
    sendEventReminder: vi.fn(async (event: StoredEvent, kind: string) => {
      state.sentReminders.push({ eventId: event.id, kind });
      // Simule le flag-set cote DB.
      const flagCol =
        kind === 'reminder_15min'
          ? 'reminder_15min_sent_at'
          : kind === 'reminder_1h'
            ? 'reminder_1h_sent_at'
            : 'reminder_24h_sent_at';
      const target = state.events.find((e) => e.id === event.id);
      if (target) {
        (target as unknown as Record<string, unknown>)[flagCol] = new Date().toISOString();
      }
      return { ok: true, eventId: event.id, kind };
    }),
  }));
}

function makeClient() {
  function makeChain(table: string) {
    const filters: Array<{ op: string; col?: string; val?: unknown }> = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      gte: (col: string, val: unknown) => {
        filters.push({ op: 'gte', col, val });
        return chain;
      },
      lte: (col: string, val: unknown) => {
        filters.push({ op: 'lte', col, val });
        return chain;
      },
      or: () => chain, // on simplifie : tous les rows passent le filtre or
      then: (cb: (v: { data: StoredEvent[]; error: null }) => unknown) => {
        if (table !== 'calendar_events') {
          return Promise.resolve({ data: [], error: null }).then(cb);
        }
        const filtered = state.events.filter((e) => {
          for (const f of filters) {
            const v = (e as unknown as Record<string, unknown>)[f.col ?? ''];
            if (f.op === 'eq' && v !== f.val) return false;
            if (f.op === 'gte' && !(typeof v === 'string' && v >= String(f.val))) return false;
            if (f.op === 'lte' && !(typeof v === 'string' && v <= String(f.val))) return false;
          }
          return true;
        });
        return Promise.resolve({ data: filtered, error: null }).then(cb);
      },
    };
    return chain;
  }
  return { from: (t: string) => makeChain(t) };
}

function makeEvent(over: Partial<StoredEvent>): StoredEvent {
  const now = new Date().toISOString();
  return {
    id: 'e-' + Math.random().toString(36).slice(2, 9),
    user_id: 'u-1',
    prospect_id: null,
    event_type: 'call_relance',
    status: 'pending',
    title: 'Test',
    description: null,
    location: null,
    start_at: now,
    end_at: null,
    is_all_day: false,
    priority: 'normal',
    duration_minutes: null,
    outcome: null,
    reminder_15min_sent_at: null,
    reminder_1h_sent_at: null,
    reminder_24h_sent_at: null,
    created_at: now,
    updated_at: now,
    created_by_user_id: null,
    google_calendar_event_id: null,
    google_calendar_synced_at: null,
    ...over,
  };
}

describe('GET /api/cron/calendar-reminders (P14.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.events = [];
    state.sentReminders = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('401 si pas de Bearer ni x-vercel-cron', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x/cron'));
    expect(res.status).toBe(401);
  });

  it('200 avec Bearer + zero events → stats vides', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(
      new Request('http://x/cron', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.processedCount).toBe(0);
  });

  it('Event a +10min → reminder_15min envoye + flag set', async () => {
    const in10min = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    state.events.push(makeEvent({ start_at: in10min, end_at: in10min, status: 'pending' }));
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x/cron', { headers: { 'x-vercel-cron': '1' } }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sent15min).toBe(1);
    expect(state.sentReminders).toEqual([expect.objectContaining({ kind: 'reminder_15min' })]);
    expect(state.events[0].reminder_15min_sent_at).toBeTruthy();
  });

  it('Event a +30min → reminder_1h envoye (pas 15min)', async () => {
    const in30min = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    state.events.push(makeEvent({ start_at: in30min, end_at: in30min }));
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x/cron', { headers: { 'x-vercel-cron': '1' } }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sent1h).toBe(1);
    expect(body.sent15min).toBe(0);
  });

  it('Event a +20h → reminder_24h envoye', async () => {
    const in20h = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    state.events.push(makeEvent({ start_at: in20h, end_at: in20h }));
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x/cron', { headers: { 'x-vercel-cron': '1' } }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sent24h).toBe(1);
  });

  it('Idempotent : 2e run ne re-envoie pas si TOUS les flags pertinents sont set', async () => {
    // Event a +10min : 15min ET 1h ET 24h sont dus. Si les 3 flags sont
    // deja set, le cron ne doit RIEN renvoyer.
    const in10min = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const sentAt = new Date().toISOString();
    state.events.push(
      makeEvent({
        start_at: in10min,
        end_at: in10min,
        reminder_15min_sent_at: sentAt,
        reminder_1h_sent_at: sentAt,
        reminder_24h_sent_at: sentAt,
      }),
    );
    mockEnv();
    const { GET } = await import('./route');
    await GET(new Request('http://x/cron', { headers: { 'x-vercel-cron': '1' } }));
    expect(state.sentReminders).toHaveLength(0);
  });

  it('Skip events status cancelled', async () => {
    const in10min = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    state.events.push(makeEvent({ start_at: in10min, end_at: in10min, status: 'cancelled' }));
    mockEnv();
    const { GET } = await import('./route');
    await GET(new Request('http://x/cron', { headers: { 'x-vercel-cron': '1' } }));
    expect(state.sentReminders).toHaveLength(0);
  });
});
