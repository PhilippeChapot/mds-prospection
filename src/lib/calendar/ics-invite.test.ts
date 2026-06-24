/**
 * @vitest-environment node
 *
 * P14.x.CalendarExternalInvites — ICS builder + GATE de type.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldSendExternalInvites,
  externalAttendees,
  escapeIcsText,
  foldLine,
  formatIcsDateUTC,
  buildEventIcs,
  eventIcsUid,
} from './ics-invite';
import type { AttendeeRecord } from '@/lib/admin/calendar/helpers';

describe('shouldSendExternalInvites — GATE de type (P14.x critique)', () => {
  it('meeting (RDV) → true', () => {
    expect(shouldSendExternalInvites({ event_type: 'meeting' })).toBe(true);
  });
  it('call_relance (Appel) → false (jamais d’email tiers)', () => {
    expect(shouldSendExternalInvites({ event_type: 'call_relance' })).toBe(false);
  });
  it('task (Tâche) → false', () => {
    expect(shouldSendExternalInvites({ event_type: 'task' })).toBe(false);
  });
});

describe('externalAttendees', () => {
  it('exclut l’organisateur, les emails invalides, et déduplique', () => {
    const list: AttendeeRecord[] = [
      { email: 'phil@mediadays.solutions' },
      { email: 'Client@Acme.fr', displayName: 'Client' },
      { email: 'client@acme.fr' },
      { email: 'invalide' },
    ];
    const out = externalAttendees(list, 'phil@mediadays.solutions');
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe('Client@Acme.fr');
  });
  it('liste vide → []', () => {
    expect(externalAttendees(null, 'x@y.fr')).toEqual([]);
  });
});

describe('escapeIcsText / formatIcsDateUTC / foldLine', () => {
  it('échappe ; , \\ et newline', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });
  it('formate une date en UTC iCalendar', () => {
    expect(formatIcsDateUTC('2026-06-24T09:30:00.000Z')).toBe('20260624T093000Z');
  });
  it('plie une ligne > 75 octets avec CRLF + espace', () => {
    const long = 'X'.repeat(200);
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    expect(folded.length).toBeGreaterThan(long.length);
  });
});

const ATT: AttendeeRecord[] = [
  { email: 'client@acme.fr', displayName: 'Client', responseStatus: 'needsAction' },
];

describe('buildEventIcs', () => {
  it('REQUEST → METHOD:REQUEST, STATUS:CONFIRMED, UID, SEQUENCE, ATTENDEE', () => {
    const ics = buildEventIcs({
      method: 'REQUEST',
      uid: 'evt-1@mediadays.solutions',
      sequence: 0,
      dtstampIso: '2026-06-24T08:00:00Z',
      summary: 'RDV partenariat',
      description: 'Discuter du pack',
      location: 'Visio',
      startIso: '2026-06-25T09:00:00Z',
      endIso: '2026-06-25T09:30:00Z',
      organizerEmail: 'phil@mediadays.solutions',
      organizerName: 'Philippe',
      attendees: ATT,
    });
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('UID:evt-1@mediadays.solutions');
    expect(ics).toContain('SEQUENCE:0');
    // L'email reste intact après pliage RFC (la ligne ATTENDEE > 75 octets est
    // pliée mais `client@acme.fr` n'est pas coupé).
    expect(ics).toContain('client@acme.fr');
    expect(ics).toContain('ORGANIZER;CN=Philippe:mailto:phil@mediadays.solutions');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('CANCEL → METHOD:CANCEL + STATUS:CANCELLED', () => {
    const ics = buildEventIcs({
      method: 'CANCEL',
      uid: eventIcsUid('evt-2'),
      sequence: 3,
      dtstampIso: '2026-06-24T08:00:00Z',
      summary: 'RDV',
      startIso: '2026-06-25T09:00:00Z',
      endIso: '2026-06-25T09:30:00Z',
      organizerEmail: 'phil@mediadays.solutions',
      attendees: ATT,
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:3');
  });
});

describe('eventIcsUid', () => {
  it('UID stable basé sur l’id', () => {
    expect(eventIcsUid('abc')).toBe('abc@mediadays.solutions');
  });
});
