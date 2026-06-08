/**
 * P14.3.ProspectTimelineDrawer — helpers backend timeline.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : async
 * pure-functions, NO 'use server'. Importable depuis page server
 * components ET server actions.
 *
 * Hydratation 2-pass :
 *   1. SELECT prospect_timeline_view WHERE prospect_id = $1.
 *   2. Bulk SELECT users + contacts pour obtenir les full_name affiches.
 *
 * Pas de JOIN dans la view car la view est UNION ALL — plus simple de
 * faire 2-3 queries dedupliquees cote app que d optimiser la view.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type TimelineEntryType = 'note' | 'calendar_event';

export type TimelineActor = {
  id: string;
  full_name: string | null;
  email: string;
};

export type TimelineContact = {
  id: string;
  full_name: string;
};

export type TimelineEntry = {
  id: string;
  prospect_id: string;
  entry_type: TimelineEntryType;
  event_at: string;
  actor: TimelineActor | null;
  contact: TimelineContact | null;
  content: string;
  calendar_event_type: 'call_relance' | 'meeting' | 'task' | null;
  calendar_event_status: 'pending' | 'done' | 'missed' | null;
  calendar_event_start: string | null;
  calendar_event_end: string | null;
};

export type ProspectContactLite = {
  id: string;
  full_name: string;
  role: string | null;
};

// ─── Timeline ─────────────────────────────────────────────────────────

/**
 * Recupere la timeline triée par event_at DESC (le plus recent en haut,
 * style passage-de-relais).
 */
export async function getProspectTimeline(prospectId: string): Promise<TimelineEntry[]> {
  if (!prospectId) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  // 1. Lit la vue.
  const { data: viewRows, error } = await supabase
    .from('prospect_timeline_view')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('event_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[getProspectTimeline] view error:', error.message);
    return [];
  }

  type ViewRow = {
    id: string;
    prospect_id: string;
    entry_type: TimelineEntryType;
    event_at: string;
    actor_user_id: string | null;
    contact_id: string | null;
    content: string;
    calendar_event_type: 'call_relance' | 'meeting' | 'task' | null;
    calendar_event_status: 'pending' | 'done' | 'missed' | null;
    calendar_event_start: string | null;
    calendar_event_end: string | null;
  };
  const rows = (viewRows ?? []) as ViewRow[];
  if (rows.length === 0) return [];

  // 2. Bulk hydrate users + contacts.
  const userIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id)),
  );
  const contactIds = Array.from(
    new Set(rows.map((r) => r.contact_id).filter((id): id is string => !!id)),
  );

  const [{ data: users }, { data: contacts }] = await Promise.all([
    userIds.length > 0
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    contactIds.length > 0
      ? supabase.from('contacts').select('id, first_name, last_name, email').in('id', contactIds)
      : Promise.resolve({ data: [] }),
  ]);

  const usersMap = new Map<string, TimelineActor>(
    ((users ?? []) as TimelineActor[]).map((u) => [u.id, u]),
  );
  const contactsMap = new Map<string, TimelineContact>(
    (
      (contacts ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }>
    ).map((c) => [
      c.id,
      {
        id: c.id,
        full_name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email,
      },
    ]),
  );

  return rows.map((r) => ({
    id: r.id,
    prospect_id: r.prospect_id,
    entry_type: r.entry_type,
    event_at: r.event_at,
    actor: r.actor_user_id ? (usersMap.get(r.actor_user_id) ?? null) : null,
    contact: r.contact_id ? (contactsMap.get(r.contact_id) ?? null) : null,
    content: r.content,
    calendar_event_type: r.calendar_event_type,
    calendar_event_status: r.calendar_event_status,
    calendar_event_start: r.calendar_event_start,
    calendar_event_end: r.calendar_event_end,
  }));
}

// ─── Contacts list (dropdown form) ────────────────────────────────────

/**
 * Liste les contacts de la company associee au prospect, pour le dropdown
 * "Avec quel contact ?" du form note.
 */
export async function getProspectContacts(prospectId: string): Promise<ProspectContactLite[]> {
  if (!prospectId) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  const { data: prospect } = await supabase
    .from('prospects')
    .select('company_id')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect?.company_id) return [];

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, role')
    .eq('company_id', prospect.company_id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(50);

  return (
    (contacts ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      role: string | null;
    }>
  ).map((c) => ({
    id: c.id,
    full_name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email,
    role: c.role,
  }));
}

/**
 * Verifie qu un contact_id appartient bien a la company du prospect.
 * Defense en profondeur cote server action (anti-CSRF / bug client).
 */
export async function validateContactBelongsToProspect(
  contactId: string,
  prospectId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const { data: prospect } = await supabase
    .from('prospects')
    .select('company_id')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect?.company_id) return false;

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('company_id', prospect.company_id)
    .maybeSingle();
  return !!contact;
}
