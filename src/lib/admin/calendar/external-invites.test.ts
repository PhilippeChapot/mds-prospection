/**
 * @vitest-environment node
 *
 * P14.x.CalendarExternalInvites — orchestration sendExternalInvitesForEvent
 * + GATE de type (aucun email pour les Appels).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEventRow } from './helpers';

interface State {
  sends: Array<{ to: string; attachments?: unknown[] }>;
}
const state: State = { sends: [] };

function mockEnv() {
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn((p: { to: string; attachments?: unknown[] }) => {
      state.sends.push({ to: p.to, attachments: p.attachments });
      return Promise.resolve({ id: 'em-1' });
    }),
  }));
  vi.doMock('@/lib/calendar/rsvp-jwt', () => ({
    signRsvpToken: () => Promise.resolve('tok-123'),
  }));
}

function mockDb(): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { email: 'phil@mediadays.solutions', full_name: 'Philippe' },
                }),
            }),
          }),
        };
      }
      if (table === 'calendar_events') {
        // Writeback sent_at (P14.x.RSVP-UI) — no-op dans le test.
        return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

function baseEvent(over: Partial<CalendarEventRow>): CalendarEventRow {
  return {
    id: 'evt-1',
    user_id: 'u1',
    prospect_id: null,
    event_type: 'meeting',
    status: 'pending',
    priority: 'normal',
    title: 'RDV partenariat',
    description: null,
    location: null,
    start_at: '2026-06-25T09:00:00Z',
    end_at: '2026-06-25T09:30:00Z',
    is_all_day: false,
    duration_minutes: 30,
    outcome: null,
    reminder_15min_sent_at: null,
    reminder_1h_sent_at: null,
    reminder_24h_sent_at: null,
    created_at: '',
    updated_at: '',
    created_by_user_id: null,
    google_calendar_event_id: null,
    google_calendar_synced_at: null,
    attendees: [{ email: 'client@acme.fr', displayName: 'Client', responseStatus: 'needsAction' }],
    ...over,
  };
}

beforeEach(() => {
  state.sends = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('sendExternalInvitesForEvent — GATE de type (P14.x critique)', () => {
  it('call_relance (Appel) avec invités externes → AUCUN email (gated)', async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(
      mockDb(),
      baseEvent({ event_type: 'call_relance' }),
      'invitation',
    );
    expect(r.gated).toBe(true);
    expect(r.sent).toBe(0);
    expect(state.sends).toHaveLength(0);
  });

  it('task avec invités externes → AUCUN email (gated)', async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(
      mockDb(),
      baseEvent({ event_type: 'task' }),
      'invitation',
    );
    expect(r.gated).toBe(true);
    expect(state.sends).toHaveLength(0);
  });

  it('meeting (RDV) → email envoyé avec pièce jointe .ics', async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(mockDb(), baseEvent({}), 'invitation');
    expect(r.gated).toBe(false);
    expect(r.sent).toBe(1);
    expect(state.sends[0].to).toBe('client@acme.fr');
    expect(state.sends[0].attachments).toHaveLength(1);
  });

  it('meeting sans invité externe (organisateur seul) → 0 envoi', async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(
      mockDb(),
      baseEvent({ attendees: [{ email: 'phil@mediadays.solutions' }] }),
      'invitation',
    );
    expect(r.gated).toBe(false);
    expect(r.sent).toBe(0);
    expect(state.sends).toHaveLength(0);
  });

  it("scope 'pending' → seuls les en attente sont relancés", async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(
      mockDb(),
      baseEvent({
        attendees: [
          { email: 'accepted@acme.fr', responseStatus: 'accepted' },
          { email: 'pending@acme.fr', responseStatus: 'needsAction' },
        ],
      }),
      'invitation',
      'pending',
    );
    expect(r.sent).toBe(1);
    expect(state.sends[0].to).toBe('pending@acme.fr');
  });

  it('scope { email } → seul cet invité est relancé', async () => {
    mockEnv();
    const { sendExternalInvitesForEvent } = await import('./external-invites');
    const r = await sendExternalInvitesForEvent(
      mockDb(),
      baseEvent({
        attendees: [
          { email: 'a@acme.fr', responseStatus: 'needsAction' },
          { email: 'b@acme.fr', responseStatus: 'needsAction' },
        ],
      }),
      'invitation',
      { email: 'b@acme.fr' },
    );
    expect(r.sent).toBe(1);
    expect(state.sends[0].to).toBe('b@acme.fr');
  });
});
