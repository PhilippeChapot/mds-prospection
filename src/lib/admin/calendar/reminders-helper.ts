/**
 * P14.1.SalesCalendarCore (Commit 4) — helper d envoi des reminders email.
 *
 * Pas de 'use server' : importable depuis le cron handler (qui est un
 * Route Handler, pas une server action).
 *
 * 1 helper public : sendEventReminder(eventId, kind). Il hydrate
 * user + prospect, render le template Resend, appelle Resend, set le
 * flag reminder_*_sent_at = now() (idempotence).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import {
  renderCalendarReminder,
  type ReminderKind,
} from '@/lib/resend/templates/calendar-reminder';
import type { AdminLocale } from './i18n-helpers';
import type { CalendarEventRow } from './helpers';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

/** Resolve les flag column DB depuis la kind du reminder. */
const FLAG_COLUMN: Record<ReminderKind, keyof CalendarEventRow> = {
  reminder_15min: 'reminder_15min_sent_at',
  reminder_1h: 'reminder_1h_sent_at',
  reminder_24h: 'reminder_24h_sent_at',
};

export type SendReminderResult =
  | { ok: true; eventId: string; kind: ReminderKind; emailId?: string }
  | { ok: false; eventId: string; kind: ReminderKind; error: string };

/**
 * Envoie un reminder email pour un calendar_event + flag DB pour idempotence.
 * Le cron filtre deja par flag null, donc en pratique ce helper n est
 * appele que pour des envois inedits. Mais on garde la verification
 * cote DB (UPDATE avec WHERE flag IS NULL) pour parer aux courses.
 */
export async function sendEventReminder(
  event: CalendarEventRow,
  kind: ReminderKind,
): Promise<SendReminderResult> {
  const supabase = getSupabaseServiceClient();

  // Hydrate le user (email + first_name + language).
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, language')
    .eq('id', event.user_id)
    .maybeSingle();
  if (userErr) return { ok: false, eventId: event.id, kind, error: userErr.message };
  if (!user || !user.email) {
    return { ok: false, eventId: event.id, kind, error: 'User introuvable ou sans email.' };
  }
  const locale: AdminLocale = (user.language ?? 'FR').toLowerCase() === 'en' ? 'en' : 'fr';
  const firstName = user.full_name?.split(' ')[0] ?? null;

  // Hydrate le prospect lie (optionnel : company name + URL fiche admin).
  let prospectCompanyName: string | null = null;
  let prospectUrl: string | null = null;
  if (event.prospect_id) {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('id, company:companies(name)')
      .eq('id', event.prospect_id)
      .maybeSingle();
    if (prospect) {
      const company = Array.isArray(prospect.company) ? prospect.company[0] : prospect.company;
      prospectCompanyName = company?.name ?? null;
      prospectUrl = `${BASE_URL}/admin/prospects/${event.prospect_id}`;
    }
  }

  const tpl = renderCalendarReminder({
    kind,
    recipientFirstName: firstName,
    eventTitle: event.title,
    eventType: event.event_type,
    startAt: event.start_at,
    endAt: event.end_at,
    location: event.location,
    description: event.description,
    prospectCompanyName,
    prospectUrl,
    calendarUrl: `${BASE_URL}/admin/calendar`,
    meetUrl: event.meet_url ?? null,
    locale,
  });

  // Send via Resend.
  let emailId: string | undefined;
  try {
    const result = await sendTransactionalEmailViaResend({
      to: user.email,
      toName: user.full_name ?? undefined,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: 'philippe@mediadays.solutions',
      tags: [
        { name: 'category', value: 'calendar_reminder' },
        { name: 'reminder_kind', value: kind },
      ],
    });
    emailId = result?.id ?? undefined;
  } catch (err) {
    return {
      ok: false,
      eventId: event.id,
      kind,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Set le flag DB (idempotence). WHERE flag IS NULL evite l overwrite si
  // un autre run a envoye en parallele entre le SELECT et l UPDATE.
  const flagCol = FLAG_COLUMN[kind];
  const { error: updErr } = await supabase
    .from('calendar_events')
    .update({ [flagCol]: new Date().toISOString() } as never)
    .eq('id', event.id)
    .is(flagCol, null);
  if (updErr) {
    // L email a ete envoye mais le flag pas set : log un warning, le
    // prochain cron risque de re-envoyer. Acceptable car rare.
    console.warn(
      `[calendar-reminder] flag-update-failed event=${event.id} kind=${kind} err=${updErr.message}`,
    );
  }

  return { ok: true, eventId: event.id, kind, emailId };
}
