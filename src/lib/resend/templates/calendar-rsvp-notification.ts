/**
 * P14.x.RSVP-UI — notification email à l'owner du RDV quand un invité répond.
 * FR (interne). Pure render.
 */

import { formatDateTimeShortFr } from '@/lib/format/dates';
import type { AttendeeResponseStatus } from '@/lib/admin/calendar/helpers';
import type { RsvpSummary } from '@/lib/admin/calendar/rsvp-ui';

export interface RsvpNotificationParams {
  responderName: string;
  responderEmail: string;
  status: AttendeeResponseStatus;
  eventTitle: string;
  startAt: string;
  summary: RsvpSummary;
  eventUrl: string;
}

export interface RsvpNotificationTemplate {
  subject: string;
  html: string;
  text: string;
}

const VERB: Record<AttendeeResponseStatus, { subjectEmoji: string; verb: string }> = {
  accepted: { subjectEmoji: '✅', verb: 'accepté' },
  declined: { subjectEmoji: '❌', verb: 'refusé' },
  tentative: { subjectEmoji: '🟠', verb: 'marqué peut-être' },
  needsAction: { subjectEmoji: '⏳', verb: 'mis en attente' },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderRsvpNotification(p: RsvpNotificationParams): RsvpNotificationTemplate {
  const v = VERB[p.status];
  const when = formatDateTimeShortFr(p.startAt);
  const subject = `${v.subjectEmoji} ${p.responderName} a ${v.verb} votre RDV du ${when}`;
  const summaryLine = `✅ ${p.summary.accepted} accepté · 🟠 ${p.summary.tentative} peut-être · ❌ ${p.summary.declined} refusé · ⏳ ${p.summary.needsAction} en attente`;

  const text = [
    'Bonjour Philippe,',
    '',
    `${p.responderName} (${p.responderEmail}) a ${v.verb} votre rendez-vous :`,
    '',
    `📅 ${p.eventTitle}`,
    `🕐 ${when}`,
    '',
    `État RSVP actuel : ${summaryLine}`,
    '',
    `→ Voir le RDV : ${p.eventUrl}`,
    '',
    '— MDS Prospection',
  ].join('\n');

  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#f5f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:24px auto;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:24px;color:#111;font-size:14px;line-height:1.5;">
    <p style="margin:0 0 12px;">Bonjour Philippe,</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(p.responderName)}</strong> (${escapeHtml(p.responderEmail)}) a <strong>${v.verb}</strong> votre rendez-vous :</p>
    <p style="margin:0 0 4px;">📅 <strong>${escapeHtml(p.eventTitle)}</strong></p>
    <p style="margin:0 0 16px;">🕐 ${escapeHtml(when)}</p>
    <p style="margin:0 0 16px;padding:10px;background:#f9fafb;border-radius:6px;font-size:13px;">État RSVP actuel : ${summaryLine}</p>
    <p style="margin:0;"><a href="${escapeHtml(p.eventUrl)}" style="color:#e6007e;font-weight:bold;text-decoration:none;">→ Voir le RDV</a></p>
    <p style="margin:24px 0 0;color:#9aa0b4;font-size:12px;">— MDS Prospection</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
