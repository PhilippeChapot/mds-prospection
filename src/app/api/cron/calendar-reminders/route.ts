/**
 * P14.1.SalesCalendarCore (Commit 4) — Vercel Cron reminders calendrier.
 *
 * Toutes les 5 minutes (cf vercel.json) :
 *   1. Auth via CRON_SECRET (header Bearer + x-vercel-cron).
 *   2. SELECT events status='pending' AND start_at >= now()
 *      AND start_at <= now()+24h
 *      AND (reminder_24h_sent_at IS NULL OR reminder_1h_sent_at IS NULL OR reminder_15min_sent_at IS NULL).
 *   3. Pour chaque event :
 *        - Si start_at - now <= 15min ET 15min_sent_at NULL → send + flag.
 *        - Sinon si <= 1h ET 1h_sent_at NULL → send + flag.
 *        - Sinon si <= 24h ET 24h_sent_at NULL → send + flag.
 *      Priorise la fenetre LA PLUS PROCHE (les 3 reminders d un meme event
 *      sortent au plus 3 fois maxi, jamais simultanement dans un meme run).
 *   4. Skip events status IN cancelled/done.
 *
 * Idempotence : les flags reminder_*_sent_at empechent le double-envoi
 * inter-runs. Defense supplementaire dans sendEventReminder
 * (UPDATE WHERE flag IS NULL).
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendEventReminder } from '@/lib/admin/calendar/reminders-helper';
import type { CalendarEventRow } from '@/lib/admin/calendar/helpers';
import type { ReminderKind } from '@/lib/resend/templates/calendar-reminder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HORIZON_24H_MS = 24 * 60 * 60 * 1000;
const HORIZON_1H_MS = 60 * 60 * 1000;
const HORIZON_15MIN_MS = 15 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const expected = process.env.CRON_SECRET;
  if (cronHeader && expected) return true;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

/**
 * Determine quel reminder envoyer pour cet event a ce moment-la.
 * Priorise la fenetre la plus proche (15min > 1h > 24h).
 * Retourne null si aucun reminder n est dû ou tous deja envoyes.
 */
function pickReminderKind(event: CalendarEventRow, now: number): ReminderKind | null {
  const startMs = new Date(event.start_at).getTime();
  if (startMs <= now) return null; // event deja commence.
  const delta = startMs - now;
  if (delta <= HORIZON_15MIN_MS && !event.reminder_15min_sent_at) return 'reminder_15min';
  if (delta <= HORIZON_1H_MS && !event.reminder_1h_sent_at) return 'reminder_1h';
  if (delta <= HORIZON_24H_MS && !event.reminder_24h_sent_at) return 'reminder_24h';
  return null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = getSupabaseServiceClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_24H_MS);

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('status', 'pending')
    .gte('start_at', now.toISOString())
    .lte('start_at', horizon.toISOString())
    .or('reminder_15min_sent_at.is.null,reminder_1h_sent_at.is.null,reminder_24h_sent_at.is.null');

  if (error) {
    console.error(`[calendar-reminders] query-failed err=${error.message}`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (events ?? []) as CalendarEventRow[];
  const stats = {
    processedCount: 0,
    sent24h: 0,
    sent1h: 0,
    sent15min: 0,
    errors: 0,
  };
  const errors: Array<{ eventId: string; kind: ReminderKind; error: string }> = [];

  for (const event of rows) {
    const kind = pickReminderKind(event, now.getTime());
    if (!kind) continue;
    stats.processedCount++;

    const result = await sendEventReminder(event, kind);
    if (result.ok) {
      if (kind === 'reminder_15min') stats.sent15min++;
      else if (kind === 'reminder_1h') stats.sent1h++;
      else if (kind === 'reminder_24h') stats.sent24h++;
    } else {
      stats.errors++;
      errors.push({ eventId: event.id, kind, error: result.error });
    }
  }

  const durationMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    durationMs,
    candidates: rows.length,
    ...stats,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
