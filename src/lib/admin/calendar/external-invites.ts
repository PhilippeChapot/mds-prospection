/**
 * P14.x.CalendarExternalInvites — orchestration de l'envoi d'invitations
 * externes (.ics + email Resend). Helper (pas de 'use server') appelé par les
 * actions create/update/delete et le cron reminders.
 *
 * ⚠️ GATE : shouldSendExternalInvites(event) (RDV/meeting only). Best-effort :
 * un échec d'envoi ne casse jamais l'action calendrier.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderCalendarInvite, type InviteKind } from '@/lib/resend/templates/calendar-invite';
import {
  buildEventIcs,
  eventIcsUid,
  externalAttendees,
  shouldSendExternalInvites,
  type IcsMethod,
} from '@/lib/calendar/ics-invite';
import { signRsvpToken } from '@/lib/calendar/rsvp-jwt';
import type { CalendarEventRow } from './helpers';

const LOG_PREFIX = '[calendar/external-invites]';
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

const METHOD_BY_KIND: Record<InviteKind, IcsMethod> = {
  invitation: 'REQUEST',
  update: 'REQUEST',
  reminder: 'REQUEST',
  cancellation: 'CANCEL',
};

export interface InviteSendResult {
  gated: boolean; // true = bloqué par le type (pas un RDV) → 0 envoi
  total: number;
  sent: number;
}

/**
 * Envoie l'invitation/update/cancel/reminder à tous les attendees externes
 * d'un RDV. No-op (gated) si l'event n'est pas un meeting.
 */
export async function sendExternalInvitesForEvent(
  db: SupabaseClient,
  event: CalendarEventRow,
  kind: InviteKind,
): Promise<InviteSendResult> {
  // ── GATE de type : RDV uniquement (jamais Appel/tâche). ──
  if (!shouldSendExternalInvites(event)) {
    return { gated: true, total: 0, sent: 0 };
  }

  // Organisateur = propriétaire de l'event.
  const { data: owner } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', event.user_id)
    .maybeSingle();
  const organizerEmail = (owner?.email as string | undefined) ?? 'philippe@mediadays.solutions';
  const organizerName = (owner?.full_name as string | undefined) ?? 'MediaDays Solutions';

  const recipients = externalAttendees(event.attendees, organizerEmail);
  if (recipients.length === 0) return { gated: false, total: 0, sent: 0 };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const startIso = event.start_at;
  const endIso =
    event.end_at ?? new Date(new Date(startIso).getTime() + DEFAULT_DURATION_MS).toISOString();
  const dtstampIso = new Date().toISOString();
  const method = METHOD_BY_KIND[kind];
  const sequence = (event as { invite_sequence?: number }).invite_sequence ?? 0;

  let sent = 0;
  for (const att of recipients) {
    try {
      const token = await signRsvpToken({ eventId: event.id, email: att.email });
      const tpl = renderCalendarInvite({
        kind,
        recipientName: att.displayName ?? null,
        organizerName,
        eventTitle: event.title,
        startAt: startIso,
        endAt: event.end_at,
        location: event.location,
        description: event.description,
        locale: 'fr',
        appUrl,
        rsvpToken: token,
      });
      const ics = buildEventIcs({
        method,
        uid: eventIcsUid(event.id),
        sequence,
        dtstampIso,
        summary: event.title,
        description: event.description,
        location: event.location,
        startIso,
        endIso,
        organizerEmail,
        organizerName,
        attendees: recipients,
      });
      await sendTransactionalEmailViaResend({
        to: att.email,
        toName: att.displayName ?? undefined,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        replyTo: organizerEmail,
        attachments: [
          {
            filename: kind === 'cancellation' ? 'cancel.ics' : 'invite.ics',
            content: ics,
            contentType: `text/calendar; charset=utf-8; method=${method}`,
          },
        ],
        tags: [
          { name: 'category', value: 'calendar_invite' },
          { name: 'invite_kind', value: kind },
        ],
      });
      sent += 1;
    } catch (err) {
      console.error(
        '%s send-failed event=%s to=%s msg=%s',
        LOG_PREFIX,
        event.id,
        att.email,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  console.log(
    '%s kind=%s event=%s sent=%s/%s',
    LOG_PREFIX,
    kind,
    event.id,
    sent,
    recipients.length,
  );
  return { gated: false, total: recipients.length, sent };
}
