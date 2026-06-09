/**
 * P14.2.SalesCalendarGoogleSync — cron retry PUSH (toutes les 15 min).
 *
 * Reprend les events restés en sync_status IN ('pending_push','pending_delete')
 * après un échec du push best-effort lors du CRUD. Idempotent : un push réussi
 * repasse l'event en 'synced' ; une suppression réussie nettoie la row.
 *
 * Auth : CRON_SECRET (Bearer) OU header x-vercel-cron.
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  pushEventToGoogle,
  persistPushResult,
  deleteEventFromGoogle,
} from '@/lib/admin/calendar/google/push-sync';
import type { CalendarEventRow } from '@/lib/admin/calendar/helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const expected = process.env.CRON_SECRET;
  if (cronHeader && expected) return true;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new NextResponse('Unauthorized', { status: 401 });

  const startedAt = Date.now();
  const supabase = getSupabaseServiceClient();

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('*')
    .in('sync_status', ['pending_push', 'pending_delete'])
    .limit(100);

  if (error) {
    console.error('[google-sync-retry] query-failed err=%s', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (events ?? []) as CalendarEventRow[];
  const stats = { processed: 0, pushed: 0, deleted: 0, errors: 0 };

  for (const event of rows) {
    stats.processed++;
    try {
      if (event.sync_status === 'pending_delete') {
        if (event.google_calendar_event_id) {
          const r = await deleteEventFromGoogle(event.user_id, event.google_calendar_event_id);
          if (r.ok) {
            await supabase.from('calendar_events').delete().eq('id', event.id);
            stats.deleted++;
          } else {
            stats.errors++;
          }
        } else {
          // Rien à supprimer côté Google → on purge la row MDS.
          await supabase.from('calendar_events').delete().eq('id', event.id);
          stats.deleted++;
        }
      } else {
        const result = await pushEventToGoogle(event, false);
        await persistPushResult(event.id, result);
        if (result.ok) stats.pushed++;
        else stats.errors++;
      }
    } catch (err) {
      stats.errors++;
      console.warn(
        '[google-sync-retry] event=%s msg=%s',
        event.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    candidates: rows.length,
    ...stats,
  });
}
