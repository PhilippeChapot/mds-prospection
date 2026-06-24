/**
 * P14.x.RSVP-UI — notification à l'owner du RDV quand un invité répond.
 * Idempotence (même statut → pas de mail) + throttle (1 mail/min/event via
 * calendar_events.last_rsvp_notification_at). Helper testable.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderRsvpNotification } from '@/lib/resend/templates/calendar-rsvp-notification';
import { computeRsvpSummary } from './rsvp-ui';
import type { AttendeeRecord, AttendeeResponseStatus } from './helpers';

const THROTTLE_MS = 60 * 1000;

export interface NotifyRsvpInput {
  eventId: string;
  ownerUserId: string;
  eventTitle: string;
  startAt: string;
  attendees: AttendeeRecord[]; // état APRÈS mise à jour
  responderEmail: string;
  responderName: string;
  oldStatus: AttendeeResponseStatus;
  newStatus: AttendeeResponseStatus;
  lastNotificationAt: string | null;
  nowMs: number;
  appUrl: string;
}

export type NotifyRsvpResult =
  | { notified: true }
  | { notified: false; reason: 'unchanged' | 'throttled' | 'error' };

export async function notifyOwnerOfRsvp(
  db: SupabaseClient,
  input: NotifyRsvpInput,
): Promise<NotifyRsvpResult> {
  // Idempotence : même statut renvoyé → aucun mail.
  if (input.oldStatus === input.newStatus) return { notified: false, reason: 'unchanged' };

  // Throttle : 1 mail/min/event.
  if (
    input.lastNotificationAt &&
    input.nowMs - new Date(input.lastNotificationAt).getTime() < THROTTLE_MS
  ) {
    return { notified: false, reason: 'throttled' };
  }

  // Destinataire = owner (fallback Phil).
  const { data: owner } = await db
    .from('users')
    .select('email')
    .eq('id', input.ownerUserId)
    .maybeSingle();
  const to = (owner?.email as string | undefined) ?? 'philippe@mediadays.solutions';

  const tpl = renderRsvpNotification({
    responderName: input.responderName,
    responderEmail: input.responderEmail,
    status: input.newStatus,
    eventTitle: input.eventTitle,
    startAt: input.startAt,
    summary: computeRsvpSummary(input.attendees),
    eventUrl: `${input.appUrl.replace(/\/$/, '')}/admin/calendar?event=${input.eventId}`,
  });

  try {
    await sendTransactionalEmailViaResend({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: 'philippe@mediadays.solutions',
      tags: [
        { name: 'category', value: 'calendar_rsvp' },
        { name: 'rsvp_status', value: input.newStatus },
      ],
    });
  } catch (err) {
    console.error(
      '[calendar/rsvp-notify] send-failed event=%s msg=%s',
      input.eventId,
      err instanceof Error ? err.message : String(err),
    );
    return { notified: false, reason: 'error' };
  }

  // Marque l'envoi (throttle).
  await db
    .from('calendar_events')
    .update({ last_rsvp_notification_at: new Date(input.nowMs).toISOString() } as never)
    .eq('id', input.eventId);

  return { notified: true };
}
