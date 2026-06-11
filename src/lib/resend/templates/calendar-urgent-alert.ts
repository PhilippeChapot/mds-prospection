/**
 * P14.5.CalendarCollaboration — alerte email urgente pour assignation d'event.
 *
 * Envoyé quand un admin coche "🚨 Envoyer alerte email urgente" lors de
 * l'assignation d'un évènement calendrier à un ou plusieurs collaborateurs.
 */

import { formatParisDateTime } from '@/lib/format/dates';

export interface CalendarUrgentAlertParams {
  firstName: string;
  eventTitle: string;
  /** ISO string UTC */
  eventStart: string;
  assignerName: string;
}

export interface CalendarUrgentAlertTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderCalendarUrgentAlertTemplate(
  locale: 'fr' | 'en',
  params: CalendarUrgentAlertParams,
): CalendarUrgentAlertTemplate {
  return locale === 'fr' ? renderFr(params) : renderEn(params);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function formatStart(iso: string, locale: 'fr' | 'en'): string {
  try {
    return formatParisDateTime(iso, locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function renderFr(p: CalendarUrgentAlertParams): CalendarUrgentAlertTemplate {
  const subject = `🚨 Urgent : vous êtes assigné(e) à « ${p.eventTitle} »`;
  const startFormatted = formatStart(p.eventStart, 'fr');

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 28px; text-align: center;">🚨</p>
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 16px; line-height: 1.55;">
          <strong>${escapeHtml(p.assignerName)}</strong> vous a assigné(e) à l'évènement suivant :
        </p>
        <div style="background: #f4f6fb; border-left: 4px solid #e6007e; border-radius: 4px; padding: 16px; margin: 0 0 24px;">
          <p style="margin: 0 0 4px; font-weight: 700; font-size: 16px;">${escapeHtml(p.eventTitle)}</p>
          <p style="margin: 0; font-size: 13px; color: #5c6b85;">📅 ${escapeHtml(startFormatted)}</p>
        </div>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Connectez-vous à votre espace admin MediaDays Solutions pour consulter les détails.
        </p>
        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          À très vite,<br />
          L'équipe MediaDays Solutions
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Bonjour ${p.firstName},`,
    ``,
    `${p.assignerName} vous a assigné(e) à l'évènement : ${p.eventTitle}`,
    `Date : ${startFormatted}`,
    ``,
    `Connectez-vous à votre espace admin pour consulter les détails.`,
    ``,
    `L'équipe MediaDays Solutions`,
  ].join('\n');

  return { subject, html, text };
}

function renderEn(p: CalendarUrgentAlertParams): CalendarUrgentAlertTemplate {
  const subject = `🚨 Urgent: you've been assigned to "${p.eventTitle}"`;
  const startFormatted = formatStart(p.eventStart, 'en');

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 28px; text-align: center;">🚨</p>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 16px; line-height: 1.55;">
          <strong>${escapeHtml(p.assignerName)}</strong> has assigned you to the following event:
        </p>
        <div style="background: #f4f6fb; border-left: 4px solid #e6007e; border-radius: 4px; padding: 16px; margin: 0 0 24px;">
          <p style="margin: 0 0 4px; font-weight: 700; font-size: 16px;">${escapeHtml(p.eventTitle)}</p>
          <p style="margin: 0; font-size: 13px; color: #5c6b85;">📅 ${escapeHtml(startFormatted)}</p>
        </div>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Log in to your MediaDays Solutions admin space to view the details.
        </p>
        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Looking forward,<br />
          The MediaDays Solutions team
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Hi ${p.firstName},`,
    ``,
    `${p.assignerName} has assigned you to: ${p.eventTitle}`,
    `Date: ${startFormatted}`,
    ``,
    `Log in to your admin space to view the details.`,
    ``,
    `The MediaDays Solutions team`,
  ].join('\n');

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
