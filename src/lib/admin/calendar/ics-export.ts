/**
 * P14.1.SalesCalendarCore (Commit 5) — export iCal RFC 5545.
 *
 * Genere un fichier .ics consommable par Apple Calendar / Google Calendar
 * via subscription URL (lecture seule). Le endpoint /api/calendar/ics/[token]
 * appelle ce helper avec les events de l user.
 *
 * RFC 5545 strict :
 *   - Line endings = CRLF (\r\n).
 *   - BEGIN:VCALENDAR / END:VCALENDAR + BEGIN:VEVENT / END:VEVENT.
 *   - PRODID + VERSION:2.0 obligatoires.
 *   - Escape chars : `\` -> `\\`, `;` -> `\;`, `,` -> `\,`, newline -> `\n`.
 *   - DTSTAMP + UID + DTSTART obligatoires par VEVENT.
 *   - DTSTART/DTEND format : YYYYMMDDTHHMMSSZ (UTC) OU
 *     YYYYMMDDTHHMMSS;TZID=Europe/Paris.
 *
 * On utilise UTC (suffix Z) pour eviter d avoir a embed VTIMEZONE — Apple
 * et Google interpretent correctement et affichent en TZ locale du client.
 *
 * Skip events sans end_at (tasks pures = pas de duree) : iCal exige DTEND
 * ou DURATION pour un VEVENT. Pour les tasks on pourrait emettre des VTODO
 * mais Apple Calendar ne les expose pas tres bien — on skip pour V1.
 */

import type { CalendarEventRow } from './helpers';

const CRLF = '\r\n';

/**
 * Echappement RFC 5545 — applique a DESCRIPTION, SUMMARY, LOCATION.
 * Doit etre une operation idempotente (escape `\` AVANT les autres).
 */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Format ISO timestamp -> "YYYYMMDDTHHMMSSZ" (UTC).
 * Ex : "2026-06-08T14:30:00.000Z" -> "20260608T143000Z".
 */
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Wrap les lignes longues a 75 octets (RFC 5545 line folding).
 * Les continuations commencent par un espace (HTAB ou SP).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    parts.push(i === 0 ? chunk : ` ${chunk}`);
    i += i === 0 ? 75 : 74;
  }
  return parts.join(CRLF);
}

export interface IcsCalendarOptions {
  /** Nom affiche dans Apple/Google Calendar pour ce calendrier. */
  calendarName?: string;
  /** Description du calendrier (visible dans l UI Apple/Google). */
  calendarDescription?: string;
  /** URL absolue MDS pour insérer un lien dans la description de chaque event. */
  baseUrl?: string;
}

/**
 * Genere le fichier .ics complet. Skip events sans end_at (tasks) et
 * events status='cancelled' (note : on garde 'done' / 'missed' pour
 * l historique du calendrier souscrit).
 */
export function generateIcsCalendar(
  events: CalendarEventRow[],
  options: IcsCalendarOptions = {},
): string {
  const name = options.calendarName ?? 'MDS Prospection — Calendrier';
  const description = options.calendarDescription ?? 'Calendrier MDS Prospection (lecture seule).';
  const dtStamp = toIcsUtc(new Date().toISOString());

  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//MDS Prospection//Calendar//FR');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeIcs(name)}`);
  lines.push(`X-WR-CALDESC:${escapeIcs(description)}`);
  lines.push('X-WR-TIMEZONE:Europe/Paris');

  for (const e of events) {
    if (!e.end_at) continue; // skip tasks pures
    if (e.status === 'cancelled') continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@mediadays.solutions`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${toIcsUtc(e.start_at)}`);
    lines.push(`DTEND:${toIcsUtc(e.end_at)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcs(e.title)}`));

    const descLines: string[] = [];
    if (e.description) descLines.push(e.description);
    if (e.outcome) descLines.push(`Résultat : ${e.outcome.replace(/_/g, ' ')}`);
    if (options.baseUrl) {
      descLines.push(`Détails : ${options.baseUrl}/admin/calendar`);
    }
    if (descLines.length > 0) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcs(descLines.join('\n'))}`));
    }

    if (e.location) {
      lines.push(foldLine(`LOCATION:${escapeIcs(e.location)}`));
    }

    // Status mapping :
    //   pending  -> CONFIRMED  (event de travail, OK)
    //   done     -> CONFIRMED  (toujours visible historiquement)
    //   missed   -> CONFIRMED  (idem, l user voit "passe")
    lines.push(`STATUS:CONFIRMED`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
