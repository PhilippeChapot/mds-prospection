/**
 * P14.1.SalesCalendarCore (Commit 4) — templates email reminder calendrier.
 *
 * 3 variantes envoyees par le cron Vercel toutes les 5min :
 *   - reminder_24h  : 24h avant l event (subject "[MDS] Demain a {time} — {title}")
 *   - reminder_1h   : 1h avant   (subject "[MDS] Dans 1h — {title}")
 *   - reminder_15min: 15min avant (subject "[MDS] Dans 15 minutes — {title}")
 *
 * Bilingue FR + EN (doctrine traduction IA). Toutes les dates formattees
 * via formatParisDateTime (doctrine timezone Europe/Paris).
 *
 * Le template est pure render — pas d effet de bord. Le sender (helper
 * reminders-helper.ts) appelle sendTransactionalEmailViaResend.
 */

import { formatParisDateTime } from '@/lib/format/dates';
import { getEventTypeLabel, type AdminLocale } from '@/lib/admin/calendar/i18n-helpers';
import type { CalendarEventType } from '@/lib/admin/calendar/helpers';

export type ReminderKind = 'reminder_24h' | 'reminder_1h' | 'reminder_15min';

export interface CalendarReminderParams {
  kind: ReminderKind;
  recipientFirstName: string | null;
  eventTitle: string;
  eventType: CalendarEventType;
  startAt: string;
  endAt: string | null;
  location: string | null;
  description: string | null;
  /** Si le calendar_event.prospect_id est lie : nom de la societe pour
   *  reference + URL fiche prospect admin. */
  prospectCompanyName: string | null;
  prospectUrl: string | null;
  /** URL absolue vers la fiche event sur /admin/calendar. */
  calendarUrl: string;
  locale: AdminLocale;
}

export interface CalendarReminderTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY = {
  fr: {
    subjectPrefix: '[MDS]',
    subjectIn24h: (time: string, title: string) => `Demain à ${time} — ${title}`,
    subjectIn1h: (title: string) => `Dans 1h — ${title}`,
    subjectIn15min: (title: string) => `Dans 15 minutes — ${title}`,
    hello: (n: string | null) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    introCall: 'Voici un rappel pour ton appel de relance à venir :',
    introMeeting: 'Voici un rappel pour ton rendez-vous à venir :',
    introTask: 'Voici un rappel pour ta tâche à venir :',
    when: 'Quand',
    type: 'Type',
    location: 'Lieu / lien',
    concerns: 'Concerne',
    notes: 'Notes',
    cta: 'Voir dans le calendrier MDS',
    footer:
      "Rappel automatique du calendrier MDS Prospection. Pour ne plus recevoir ce rappel, marque l'évènement comme « fait » ou « annulé ».",
  },
  en: {
    subjectPrefix: '[MDS]',
    subjectIn24h: (time: string, title: string) => `Tomorrow at ${time} — ${title}`,
    subjectIn1h: (title: string) => `In 1 hour — ${title}`,
    subjectIn15min: (title: string) => `In 15 minutes — ${title}`,
    hello: (n: string | null) => (n ? `Hi ${n},` : 'Hi,'),
    introCall: 'A quick reminder about your upcoming follow-up call:',
    introMeeting: 'A quick reminder about your upcoming meeting:',
    introTask: 'A quick reminder about your upcoming task:',
    when: 'When',
    type: 'Type',
    location: 'Location / link',
    concerns: 'Concerns',
    notes: 'Notes',
    cta: 'View in MDS calendar',
    footer:
      'Automatic reminder from the MDS Prospection calendar. To stop receiving this reminder, mark the event as "done" or "cancelled".',
  },
} as const;

function renderSubject(params: CalendarReminderParams): string {
  const c = COPY[params.locale];
  const timeOnly = formatParisDateTime(params.startAt, params.locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (params.kind === 'reminder_24h') {
    return `${c.subjectPrefix} ${c.subjectIn24h(timeOnly, params.eventTitle)}`;
  }
  if (params.kind === 'reminder_1h') {
    return `${c.subjectPrefix} ${c.subjectIn1h(params.eventTitle)}`;
  }
  return `${c.subjectPrefix} ${c.subjectIn15min(params.eventTitle)}`;
}

function renderIntro(params: CalendarReminderParams): string {
  const c = COPY[params.locale];
  if (params.eventType === 'call_relance') return c.introCall;
  if (params.eventType === 'meeting') return c.introMeeting;
  return c.introTask;
}

export function renderCalendarReminder(params: CalendarReminderParams): CalendarReminderTemplate {
  const c = COPY[params.locale];
  const subject = renderSubject(params);
  const intro = renderIntro(params);

  const whenStr = formatParisDateTime(params.startAt, params.locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const whenWithEnd = params.endAt
    ? `${whenStr} → ${formatParisDateTime(params.endAt, params.locale, {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : whenStr;
  const typeLabel = getEventTypeLabel(params.eventType, params.locale);

  // ── HTML ──
  const rows: string[] = [
    `<tr><td style="padding:6px 0;color:#666;width:90px;">${c.when}</td><td style="padding:6px 0;"><strong>${escapeHtml(whenWithEnd)}</strong></td></tr>`,
    `<tr><td style="padding:6px 0;color:#666;">${c.type}</td><td style="padding:6px 0;">${escapeHtml(typeLabel)}</td></tr>`,
  ];
  if (params.location) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#666;">${c.location}</td><td style="padding:6px 0;">${escapeHtml(params.location)}</td></tr>`,
    );
  }
  if (params.prospectCompanyName && params.prospectUrl) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#666;">${c.concerns}</td><td style="padding:6px 0;"><a href="${escapeHtml(params.prospectUrl)}" style="color:#e6007e;text-decoration:none;">${escapeHtml(params.prospectCompanyName)}</a></td></tr>`,
    );
  }
  if (params.description) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#666;vertical-align:top;">${c.notes}</td><td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(params.description)}</td></tr>`,
    );
  }

  const html = `<!doctype html>
<html lang="${params.locale}"><body style="margin:0;padding:0;background:#f5f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#031a56 0%,#294294 100%);color:white;padding:16px 24px;">
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8;">MDS Prospection</p>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:bold;">📅 ${escapeHtml(params.eventTitle)}</h1>
    </div>
    <div style="padding:20px 24px;color:#111;font-size:14px;line-height:1.5;">
      <p style="margin:0 0 12px;">${escapeHtml(c.hello(params.recipientFirstName))}</p>
      <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${rows.join('\n        ')}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${escapeHtml(params.calendarUrl)}" style="display:inline-block;padding:10px 20px;background:#e6007e;color:white;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;">${c.cta}</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:12px 24px;color:#6b7280;font-size:11px;line-height:1.4;border-top:1px solid #e5e7eb;">
      ${escapeHtml(c.footer)}
    </div>
  </div>
</body></html>`;

  // ── Text fallback ──
  const textLines = [
    c.hello(params.recipientFirstName),
    '',
    intro,
    '',
    `${c.when}    : ${whenWithEnd}`,
    `${c.type}    : ${typeLabel}`,
  ];
  if (params.location) textLines.push(`${c.location} : ${params.location}`);
  if (params.prospectCompanyName) {
    textLines.push(`${c.concerns} : ${params.prospectCompanyName} (${params.prospectUrl ?? ''})`);
  }
  if (params.description) {
    textLines.push('', `${c.notes} :`, params.description);
  }
  textLines.push('', `${c.cta} : ${params.calendarUrl}`, '', '---', c.footer);

  return { subject, html, text: textLines.join('\n') };
}
