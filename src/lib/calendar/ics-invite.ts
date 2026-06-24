/**
 * P14.x.CalendarExternalInvites — génération iCalendar (RFC 5545) pour les
 * invitations externes + GATE de type. Module pur (pas de 'use server').
 *
 * ⚠️ GATE CRITIQUE : on n'envoie d'invitation externe QUE pour les RDV
 * (event_type === 'meeting'). Les 'call_relance' (Appels) sont des rappels
 * personnels de Phil → JAMAIS d'email à un tiers. 'task' non plus.
 */

import type { AttendeeRecord, CalendarEventRow } from '@/lib/admin/calendar/helpers';

export type IcsMethod = 'REQUEST' | 'CANCEL';

/** GATE : invitations externes réservées aux RDV (meeting). */
export function shouldSendExternalInvites(event: Pick<CalendarEventRow, 'event_type'>): boolean {
  return event.event_type === 'meeting';
}

/** Attendees externes valides (email présent), dédupliqués, hors organisateur. */
export function externalAttendees(
  attendees: AttendeeRecord[] | null | undefined,
  organizerEmail: string,
): AttendeeRecord[] {
  const org = organizerEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const out: AttendeeRecord[] = [];
  for (const a of attendees ?? []) {
    const email = a.email?.trim().toLowerCase();
    if (!email || !email.includes('@') || email === org || seen.has(email)) continue;
    seen.add(email);
    out.push(a);
  }
  return out;
}

// ─── RFC 5545 helpers ───

/** Échappe une valeur texte iCalendar (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** Plie une ligne à 75 octets (RFC 5545 §3.1), continuation = CRLF + espace. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    // 75 pour la 1re ligne ; 74 ensuite (l'espace de continuation compte).
    const limit = out.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

/** Format UTC iCalendar : YYYYMMDDTHHMMSSZ. */
export function formatIcsDateUTC(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

const PARTSTAT: Record<NonNullable<AttendeeRecord['responseStatus']>, string> = {
  needsAction: 'NEEDS-ACTION',
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  tentative: 'TENTATIVE',
};

export interface BuildIcsInput {
  method: IcsMethod;
  /** UID stable de l'event (même valeur pour invitation/update/cancel). */
  uid: string;
  sequence: number;
  /** Horodatage de génération (ISO) — passé explicitement (Date.now interdit en pur). */
  dtstampIso: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
  organizerEmail: string;
  organizerName?: string | null;
  attendees: AttendeeRecord[];
}

/** Construit un VCALENDAR complet (CRLF, lignes pliées). */
export function buildEventIcs(input: BuildIcsInput): string {
  const cancelled = input.method === 'CANCEL';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MediaDays Solutions//Prospection//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${formatIcsDateUTC(input.dtstampIso)}`,
    `DTSTART:${formatIcsDateUTC(input.startIso)}`,
    `DTEND:${formatIcsDateUTC(input.endIso)}`,
    `SEQUENCE:${input.sequence}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);

  const orgCn = input.organizerName ? `;CN=${escapeIcsText(input.organizerName)}` : '';
  lines.push(`ORGANIZER${orgCn}:mailto:${input.organizerEmail}`);

  for (const a of input.attendees) {
    const cn = a.displayName ? `;CN=${escapeIcsText(a.displayName)}` : '';
    const partstat = PARTSTAT[a.responseStatus ?? 'needsAction'] ?? 'NEEDS-ACTION';
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE${cn}:mailto:${a.email}`,
    );
  }

  lines.push(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** UID stable d'un event (RFC 5545 : identique pour REQUEST/CANCEL). */
export function eventIcsUid(eventId: string): string {
  return `${eventId}@mediadays.solutions`;
}
