'use server';

/**
 * P14.1.SalesCalendarCore — actions calendrier scoped a un prospect.
 *
 * Separe de ./actions.ts pour clarte (les actions ici sont des helpers
 * specifiques fiche prospect : list upcoming/past + alerte 14j).
 *
 * Doctrine 'use server' [[feedback_pnpm_build_before_push_server_files]] :
 * exports async only.
 */

import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { CalendarEventRow } from './helpers';

const inputSchema = z.object({ prospect_id: z.string().uuid() });

export type ProspectCalendarResult =
  | {
      ok: true;
      upcoming: CalendarEventRow[];
      past: CalendarEventRow[];
      daysSinceLastActivity: number | null;
      hasOverdueAlert: boolean;
    }
  | { ok: false; error: string };

/**
 * Liste les events lies a un prospect, splittes en upcoming (now+future,
 * status=pending) et past (status in done/cancelled/missed OU start_at<now).
 *
 * Calcule aussi daysSinceLastActivity depuis prospects.last_activity_at
 * pour piloter l alerte "aucune relance depuis X jours" cote UI.
 *
 * RBAC : tout admin/sales/super_admin (les events sont consultables si
 * tu vois la fiche prospect). On NE filtre PAS par user_id ici pour
 * permettre la visibilite cross-team (un sales peut voir les events
 * d un autre sales sur LE MEME prospect, utile pour collaboration).
 */
export async function listEventsForProspectAction(
  input: z.input<typeof inputSchema>,
): Promise<ProspectCalendarResult> {
  await requireAdminProfile();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('prospect_id', parsed.data.prospect_id)
    .order('start_at', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const now = Date.now();
  const upcoming: CalendarEventRow[] = [];
  const past: CalendarEventRow[] = [];
  for (const e of (events ?? []) as CalendarEventRow[]) {
    const startMs = new Date(e.start_at).getTime();
    const isFuturePending = e.status === 'pending' && startMs >= now;
    if (isFuturePending) upcoming.push(e);
    else past.push(e);
  }
  // Past : tri inverse pour afficher le plus recent en haut.
  past.reverse();

  // Calcul daysSinceLastActivity depuis prospects.last_activity_at.
  const { data: prospect } = await supabase
    .from('prospects')
    .select('last_activity_at')
    .eq('id', parsed.data.prospect_id)
    .maybeSingle();
  let daysSinceLastActivity: number | null = null;
  if (prospect?.last_activity_at) {
    const diffMs = now - new Date(prospect.last_activity_at).getTime();
    daysSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
  const hasOverdueAlert =
    upcoming.length === 0 && daysSinceLastActivity !== null && daysSinceLastActivity > 14;

  return { ok: true, upcoming, past, daysSinceLastActivity, hasOverdueAlert };
}
