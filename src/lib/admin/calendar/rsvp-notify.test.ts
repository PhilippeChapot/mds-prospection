/**
 * @vitest-environment node
 *
 * P14.x.RSVP-UI — notification owner (idempotence + throttle).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttendeeRecord } from './helpers';

interface State {
  sends: number;
  updates: Array<Record<string, unknown>>;
}
const state: State = { sends: 0, updates: [] };

function mockEnv() {
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(() => {
      state.sends += 1;
      return Promise.resolve({ id: 'em-1' });
    }),
  }));
}

function mockDb(): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: 'phil@mds.fr' } }) }),
          }),
        };
      }
      if (table === 'calendar_events') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: () => {
              state.updates.push(patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

const attendees: AttendeeRecord[] = [{ email: 'client@acme.fr', responseStatus: 'accepted' }];

const baseInput = {
  eventId: 'evt-1',
  ownerUserId: 'u1',
  eventTitle: 'RDV',
  startAt: '2026-06-25T09:00:00Z',
  attendees,
  responderEmail: 'client@acme.fr',
  responderName: 'Client',
  appUrl: 'https://www.mediadays.solutions',
};

beforeEach(() => {
  state.sends = 0;
  state.updates = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('notifyOwnerOfRsvp (P14.x)', () => {
  it('changement de statut frais → 1 mail + throttle stamp', async () => {
    mockEnv();
    const { notifyOwnerOfRsvp } = await import('./rsvp-notify');
    const r = await notifyOwnerOfRsvp(mockDb(), {
      ...baseInput,
      oldStatus: 'needsAction',
      newStatus: 'accepted',
      lastNotificationAt: null,
      nowMs: Date.now(),
    });
    expect(r.notified).toBe(true);
    expect(state.sends).toBe(1);
    expect(state.updates[0].last_rsvp_notification_at).toBeTruthy();
  });

  it('même statut renvoyé → aucun mail (idempotence)', async () => {
    mockEnv();
    const { notifyOwnerOfRsvp } = await import('./rsvp-notify');
    const r = await notifyOwnerOfRsvp(mockDb(), {
      ...baseInput,
      oldStatus: 'accepted',
      newStatus: 'accepted',
      lastNotificationAt: null,
      nowMs: Date.now(),
    });
    expect(r.notified).toBe(false);
    expect(state.sends).toBe(0);
  });

  it('2e réponse < 1 min → throttlé (0 mail)', async () => {
    mockEnv();
    const { notifyOwnerOfRsvp } = await import('./rsvp-notify');
    const now = Date.now();
    const r = await notifyOwnerOfRsvp(mockDb(), {
      ...baseInput,
      oldStatus: 'accepted',
      newStatus: 'declined',
      lastNotificationAt: new Date(now - 10_000).toISOString(),
      nowMs: now,
    });
    expect(r.notified).toBe(false);
    if (!r.notified) expect(r.reason).toBe('throttled');
    expect(state.sends).toBe(0);
  });
});
