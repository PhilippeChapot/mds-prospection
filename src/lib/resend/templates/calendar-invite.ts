/**
 * P14.x.CalendarExternalInvites — templates email d'invitation externe (RDV).
 * Bilingue FR/EN. 4 variantes : invitation / update / cancellation / reminder.
 * Pure render (le sender attache le .ics + appelle Resend).
 *
 * RSVP : 3 boutons (accepter / refuser / peut-être) pointant vers
 * /api/calendar/rsvp/{token}?r=accepted|declined|tentative.
 */

import { formatParisDateTime } from '@/lib/format/dates';
import type { AdminLocale } from '@/lib/admin/calendar/i18n-helpers';

export type InviteKind = 'invitation' | 'update' | 'cancellation' | 'reminder';

export interface CalendarInviteParams {
  kind: InviteKind;
  recipientName: string | null;
  organizerName: string;
  eventTitle: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  description: string | null;
  locale: AdminLocale;
  /** Base URL absolue (ex: https://www.mediadays.solutions). */
  appUrl: string;
  /** JWT RSVP de ce destinataire pour cet event. */
  rsvpToken: string;
}

export interface CalendarInviteTemplate {
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
    subjInvitation: (t: string, d: string) => `Invitation : ${t} — ${d}`,
    subjUpdate: (t: string, d: string) => `Mise à jour : ${t} — ${d}`,
    subjCancellation: (t: string) => `Annulation : ${t}`,
    subjReminder: (t: string, d: string) => `Rappel : ${t} — ${d}`,
    hello: (n: string | null) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    introInvitation: (org: string) => `${org} vous invite à un rendez-vous :`,
    introUpdate: (org: string) => `${org} a mis à jour ce rendez-vous :`,
    introCancellation: (org: string) => `${org} a annulé ce rendez-vous :`,
    introReminder: () => 'Rappel de votre rendez-vous à venir :',
    when: 'Quand',
    location: 'Lieu / lien',
    notes: 'Détails',
    rsvpQuestion: 'Serez-vous présent(e) ?',
    accept: '✓ Oui, je serai présent(e)',
    tentative: '? Peut-être',
    decline: '✗ Non, je ne pourrai pas',
    cancelledNotice: 'Ce rendez-vous a été annulé. Vous pouvez le retirer de votre agenda.',
    footer:
      'Invitation envoyée via MediaDays Solutions. Le fichier .ics joint ajoute le rendez-vous à votre agenda.',
  },
  en: {
    subjInvitation: (t: string, d: string) => `Invitation: ${t} — ${d}`,
    subjUpdate: (t: string, d: string) => `Updated: ${t} — ${d}`,
    subjCancellation: (t: string) => `Cancelled: ${t}`,
    subjReminder: (t: string, d: string) => `Reminder: ${t} — ${d}`,
    hello: (n: string | null) => (n ? `Hi ${n},` : 'Hi,'),
    introInvitation: (org: string) => `${org} invites you to a meeting:`,
    introUpdate: (org: string) => `${org} updated this meeting:`,
    introCancellation: (org: string) => `${org} cancelled this meeting:`,
    introReminder: () => 'A reminder of your upcoming meeting:',
    when: 'When',
    location: 'Location / link',
    notes: 'Details',
    rsvpQuestion: 'Will you attend?',
    accept: '✓ Yes, I will attend',
    tentative: '? Maybe',
    decline: '✗ No, I can’t make it',
    cancelledNotice: 'This meeting has been cancelled. You can remove it from your calendar.',
    footer:
      'Invitation sent via MediaDays Solutions. The attached .ics file adds the meeting to your calendar.',
  },
} as const;

function rsvpUrl(appUrl: string, token: string, response: string): string {
  return `${appUrl.replace(/\/$/, '')}/api/calendar/rsvp/${token}?r=${response}`;
}

export function renderCalendarInvite(params: CalendarInviteParams): CalendarInviteTemplate {
  const c = COPY[params.locale];
  const dateShort = formatParisDateTime(params.startAt, params.locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const whenFull = formatParisDateTime(params.startAt, params.locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const whenWithEnd = params.endAt
    ? `${whenFull} → ${formatParisDateTime(params.endAt, params.locale, { hour: '2-digit', minute: '2-digit' })}`
    : whenFull;

  const subject =
    params.kind === 'invitation'
      ? c.subjInvitation(params.eventTitle, dateShort)
      : params.kind === 'update'
        ? c.subjUpdate(params.eventTitle, dateShort)
        : params.kind === 'cancellation'
          ? c.subjCancellation(params.eventTitle)
          : c.subjReminder(params.eventTitle, dateShort);

  const intro =
    params.kind === 'invitation'
      ? c.introInvitation(params.organizerName)
      : params.kind === 'update'
        ? c.introUpdate(params.organizerName)
        : params.kind === 'cancellation'
          ? c.introCancellation(params.organizerName)
          : c.introReminder();

  const cancelled = params.kind === 'cancellation';

  const rows: string[] = [
    `<tr><td style="padding:6px 0;color:#666;width:90px;">${c.when}</td><td style="padding:6px 0;"><strong>${escapeHtml(whenWithEnd)}</strong></td></tr>`,
  ];
  if (params.location) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#666;">${c.location}</td><td style="padding:6px 0;">${escapeHtml(params.location)}</td></tr>`,
    );
  }
  if (params.description) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#666;vertical-align:top;">${c.notes}</td><td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(params.description)}</td></tr>`,
    );
  }

  const rsvpBlock = cancelled
    ? `<p style="margin:20px 0 0;padding:12px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:13px;">${c.cancelledNotice}</p>`
    : `<p style="margin:24px 0 10px;font-weight:bold;">${c.rsvpQuestion}</p>
       <div style="text-align:center;">
         <a href="${rsvpUrl(params.appUrl, params.rsvpToken, 'accepted')}" style="display:inline-block;margin:0 4px 8px;padding:10px 16px;background:#0b8043;color:white;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;">${c.accept}</a>
         <a href="${rsvpUrl(params.appUrl, params.rsvpToken, 'tentative')}" style="display:inline-block;margin:0 4px 8px;padding:10px 16px;background:#b78103;color:white;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;">${c.tentative}</a>
         <a href="${rsvpUrl(params.appUrl, params.rsvpToken, 'declined')}" style="display:inline-block;margin:0 4px 8px;padding:10px 16px;background:#b91c1c;color:white;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;">${c.decline}</a>
       </div>`;

  const html = `<!doctype html>
<html lang="${params.locale}"><body style="margin:0;padding:0;background:#f5f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#031a56 0%,#294294 100%);color:white;padding:16px 24px;">
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8;">MediaDays Solutions</p>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:bold;">📅 ${escapeHtml(params.eventTitle)}</h1>
    </div>
    <div style="padding:20px 24px;color:#111;font-size:14px;line-height:1.5;">
      <p style="margin:0 0 12px;">${escapeHtml(c.hello(params.recipientName))}</p>
      <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${rows.join('\n        ')}
      </table>
      ${rsvpBlock}
    </div>
    <div style="background:#f9fafb;padding:12px 24px;color:#6b7280;font-size:11px;line-height:1.4;border-top:1px solid #e5e7eb;">
      ${escapeHtml(c.footer)}
    </div>
  </div>
</body></html>`;

  const textLines = [c.hello(params.recipientName), '', intro, '', `${c.when} : ${whenWithEnd}`];
  if (params.location) textLines.push(`${c.location} : ${params.location}`);
  if (params.description) textLines.push('', `${c.notes} :`, params.description);
  if (cancelled) {
    textLines.push('', c.cancelledNotice);
  } else {
    textLines.push(
      '',
      c.rsvpQuestion,
      `${c.accept} : ${rsvpUrl(params.appUrl, params.rsvpToken, 'accepted')}`,
      `${c.tentative} : ${rsvpUrl(params.appUrl, params.rsvpToken, 'tentative')}`,
      `${c.decline} : ${rsvpUrl(params.appUrl, params.rsvpToken, 'declined')}`,
    );
  }
  textLines.push('', '---', c.footer);

  return { subject, html, text: textLines.join('\n') };
}
