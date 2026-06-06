/**
 * P14.1.SalesCalendarCore — helpers sync partages entre les server actions
 * et l UI calendrier.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * exporte des fonctions SYNC + types + maps. Les server actions vivent
 * dans ./actions.ts ('use server').
 *
 * Doctrine [[feedback_force_paris_timezone_doctrine]] : aucune conversion
 * timezone ici — tout est en TIMESTAMPTZ DB (UTC interne). Le formatage
 * Europe/Paris se fait cote UI via @/lib/format/dates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// ─── Types metier ───

export type CalendarEventType = 'call_relance' | 'meeting' | 'task';
export type CalendarEventStatus = 'pending' | 'done' | 'cancelled' | 'missed';
export type CalendarEventPriority = 'low' | 'normal' | 'high';

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
  'call_relance',
  'meeting',
  'task',
] as const;

export const CALENDAR_EVENT_STATUSES: readonly CalendarEventStatus[] = [
  'pending',
  'done',
  'cancelled',
  'missed',
] as const;

export const CALENDAR_EVENT_PRIORITIES: readonly CalendarEventPriority[] = [
  'low',
  'normal',
  'high',
] as const;

export type CalendarEventRow = {
  id: string;
  user_id: string;
  prospect_id: string | null;
  event_type: CalendarEventType;
  status: CalendarEventStatus;
  priority: CalendarEventPriority;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  duration_minutes: number | null;
  outcome: string | null;
  reminder_15min_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  reminder_24h_sent_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  google_calendar_event_id: string | null;
  google_calendar_synced_at: string | null;
};

// ─── Mappings UI (couleurs + icones) ───

export function getEventTypeColor(type: CalendarEventType): string {
  return (
    {
      call_relance: 'bg-orange-100 text-orange-800 border-orange-300',
      meeting: 'bg-blue-100 text-blue-800 border-blue-300',
      task: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    } as const
  )[type];
}

export function getEventTypeIcon(type: CalendarEventType): string {
  return ({ call_relance: '📞', meeting: '👥', task: '✅' } as const)[type];
}

export function getEventStatusColor(status: CalendarEventStatus): string {
  return (
    {
      pending: 'bg-amber-100 text-amber-800',
      done: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-slate-200 text-slate-600',
      missed: 'bg-red-100 text-red-800',
    } as const
  )[status];
}

// ─── Conflict detection (anti-overlap applicatif) ───

export type ConflictMatch = Pick<
  CalendarEventRow,
  'id' | 'title' | 'start_at' | 'end_at' | 'event_type'
>;

/**
 * Verifie si un creneau [startAt, endAt] sur user_id chevauche un event
 * existant (status NOT IN cancelled/done). Retourne le 1er conflit trouve
 * ou null si libre.
 *
 * Defense en profondeur applicative — la DB a aussi une EXCLUDE constraint
 * en backup (cf. migration 0082). L action applicative permet d afficher
 * un warning UI friendly avant le INSERT.
 *
 * Si endAt est null (task sans duree), pas de check → return null. Une
 * task n occupe pas de creneau.
 */
export async function checkOverlap(
  userId: string,
  startAt: Date,
  endAt: Date | null,
  excludeEventId?: string,
  client?: SupabaseClient,
): Promise<ConflictMatch | null> {
  if (!endAt) return null;
  const supabase = client ?? getSupabaseServiceClient();

  // Overlap = (a.start < b.end) && (a.end > b.start). On filtre cote DB
  // tout event qui chevauche [startAt, endAt] sur le meme user, en
  // excluant les events cancelled/done. excludeEventId permet de gerer
  // l update (on s autorise a overlapper avec soi-meme).
  let query = supabase
    .from('calendar_events')
    .select('id, title, start_at, end_at, event_type')
    .eq('user_id', userId)
    .not('end_at', 'is', null)
    .not('status', 'in', '(cancelled,done)')
    .lt('start_at', endAt.toISOString())
    .gt('end_at', startAt.toISOString());

  if (excludeEventId) {
    query = query.neq('id', excludeEventId);
  }

  const { data, error } = await query.limit(1);
  if (error) throw new Error(`checkOverlap: ${error.message}`);
  return (data?.[0] as ConflictMatch | undefined) ?? null;
}

/**
 * Cas humain-friendly pour l outcome (call_relance / meeting). UI peut
 * proposer ces options en select avant de fallback texte libre.
 */
export const COMMON_OUTCOMES: readonly string[] = [
  'no_response',
  'reached_recall_later',
  'demo_booked',
  'meeting_booked',
  'qualified',
  'not_interested',
  'lost',
  'wrong_contact',
] as const;
