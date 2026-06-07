/**
 * @vitest-environment node
 *
 * P14.1.SalesCalendarCore (Commit 5) — tests export iCal.
 */

import { describe, it, expect } from 'vitest';
import { generateIcsCalendar } from './ics-export';
import type { CalendarEventRow } from './helpers';

function makeEvent(over: Partial<CalendarEventRow>): CalendarEventRow {
  const now = '2026-06-07T10:00:00.000Z';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'u-1',
    prospect_id: null,
    event_type: 'meeting',
    status: 'pending',
    priority: 'normal',
    title: 'Demo',
    description: null,
    location: null,
    start_at: '2026-06-08T14:00:00.000Z',
    end_at: '2026-06-08T15:00:00.000Z',
    is_all_day: false,
    duration_minutes: 60,
    outcome: null,
    reminder_15min_sent_at: null,
    reminder_1h_sent_at: null,
    reminder_24h_sent_at: null,
    created_at: now,
    updated_at: now,
    created_by_user_id: 'u-1',
    google_calendar_event_id: null,
    google_calendar_synced_at: null,
    ...over,
  };
}

describe('generateIcsCalendar (P14.1 Commit 5)', () => {
  it('Header + footer RFC 5545 corrects', () => {
    const ics = generateIcsCalendar([]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/VERSION:2\.0\r\n/);
    expect(ics).toMatch(/PRODID:-\/\/MDS Prospection/);
    expect(ics).toMatch(/X-WR-TIMEZONE:Europe\/Paris/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    // CRLF strict partout (pas de \n nu).
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('Un event genere un VEVENT complet (UID, DTSTART, DTEND, SUMMARY, STATUS)', () => {
    const ics = generateIcsCalendar([
      makeEvent({
        title: 'Demo Acme',
        start_at: '2026-06-08T14:00:00.000Z',
        end_at: '2026-06-08T15:30:00.000Z',
      }),
    ]);
    expect(ics).toMatch(/BEGIN:VEVENT/);
    expect(ics).toMatch(/UID:11111111-1111-4111-8111-111111111111@mediadays\.solutions/);
    expect(ics).toMatch(/DTSTART:20260608T140000Z/);
    expect(ics).toMatch(/DTEND:20260608T153000Z/);
    expect(ics).toMatch(/SUMMARY:Demo Acme/);
    expect(ics).toMatch(/STATUS:CONFIRMED/);
    expect(ics).toMatch(/END:VEVENT/);
  });

  it('Skip events sans end_at (tasks pures)', () => {
    const ics = generateIcsCalendar([
      makeEvent({ id: '22222222-2222-4222-8222-222222222222', event_type: 'task', end_at: null }),
      makeEvent({ id: '33333333-3333-4333-8333-333333333333', event_type: 'meeting' }),
    ]);
    expect(ics).not.toContain('22222222-2222-4222-8222-222222222222');
    expect(ics).toContain('33333333-3333-4333-8333-333333333333');
  });

  it('Skip events cancelled', () => {
    const ics = generateIcsCalendar([
      makeEvent({ id: '44444444-4444-4444-8444-444444444444', status: 'cancelled' }),
    ]);
    expect(ics).not.toContain('44444444-4444-4444-8444-444444444444');
  });

  it('Echappement RFC 5545 : ; , \\ + newlines dans DESCRIPTION', () => {
    const ics = generateIcsCalendar([
      makeEvent({
        title: 'Test; avec, virgule \\ backslash',
        description: 'Ligne 1\nLigne 2; semi',
        location: 'Paris, France',
      }),
    ]);
    expect(ics).toMatch(/SUMMARY:Test\\; avec\\, virgule \\\\ backslash/);
    expect(ics).toMatch(/DESCRIPTION:Ligne 1\\nLigne 2\\; semi/);
    expect(ics).toMatch(/LOCATION:Paris\\, France/);
  });

  it('Garde events done + missed (historique calendrier souscrit)', () => {
    const ics = generateIcsCalendar([
      makeEvent({ id: '55555555-5555-4555-8555-555555555555', status: 'done' }),
      makeEvent({ id: '66666666-6666-4666-8666-666666666666', status: 'missed' }),
    ]);
    expect(ics).toContain('55555555-5555-4555-8555-555555555555');
    expect(ics).toContain('66666666-6666-4666-8666-666666666666');
  });
});
