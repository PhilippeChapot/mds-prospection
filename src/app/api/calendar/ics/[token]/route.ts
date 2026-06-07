/**
 * P14.1.SalesCalendarCore (Commit 5) — endpoint .ics RFC 5545 public.
 *
 * Authentification par token UUID secret stocke dans users.calendar_ics_token.
 * Le token est genere a la demande via regenerateIcsTokenAction (settings UI).
 * Si l user revoke (regenere), l ancienne URL retourne 404.
 *
 * Fenetre : 30 jours dans le passe + 365 jours dans le futur (suffit pour
 * un calendrier de prospection ; pas de pagination iCal native).
 *
 * Headers :
 *   - Content-Type: text/calendar; charset=utf-8
 *   - Content-Disposition: inline; filename="mds-calendar.ics"
 *   - Cache-Control: no-store (le calendrier evolue, pas de cache nav)
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { generateIcsCalendar } from '@/lib/admin/calendar/ics-export';
import type { CalendarEventRow } from '@/lib/admin/calendar/helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAST_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_DAYS_MS = 365 * 24 * 60 * 60 * 1000;

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new NextResponse('Not found', { status: 404 });
  }
  const supabase = getSupabaseServiceClient();

  // Lookup user via token. WHERE clause partial-unique (cf migration 0082).
  const { data: user } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('calendar_ics_token', token)
    .maybeSingle();
  if (!user) {
    return new NextResponse('Not found', { status: 404 });
  }

  const now = Date.now();
  const past = new Date(now - PAST_DAYS_MS).toISOString();
  const future = new Date(now + FUTURE_DAYS_MS).toISOString();

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_at', past)
    .lte('start_at', future)
    .order('start_at', { ascending: true });

  if (error) {
    return new NextResponse('Internal error', { status: 500 });
  }

  const ics = generateIcsCalendar((events ?? []) as CalendarEventRow[], {
    calendarName: `MDS Prospection — ${user.full_name ?? 'Calendrier'}`,
    calendarDescription:
      'Évènements MDS Prospection (lecture seule). Pour modifier, va sur /admin/calendar.',
    baseUrl: BASE_URL,
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="mds-calendar.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
