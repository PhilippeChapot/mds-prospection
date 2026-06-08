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

export type TimelineEntryType = 'note' | 'calendar_event' | 'auto';

/**
 * P14.4 — sous-type pour les auto-entries lues depuis audit_log. Le mapping
 * audit_log row → AutoEntryKind se fait dans mapAuditLogToAutoEntry().
 */
export type AutoEntryKind =
  | 'status_changed'
  | 'owner_changed'
  | 'pack_changed'
  | 'booth_assigned'
  | 'booth_cleared'
  | 'stand_assigned'
  | 'quote_emit_success'
  | 'stripe_payment_received'
  | 'signup_converted'
  | 'unknown';

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
  /** P14.4 : pour entry_type='auto', sous-type discriminant. */
  auto_kind?: AutoEntryKind;
  /** P14.4 : payload brut audit_log.after pour AutoEntryChip (link ext, montant, etc.). */
  auto_payload?: Record<string, unknown> | null;
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

// ─── P14.4 : audit_log auto-entries ───────────────────────────────────

type AuditLogRow = {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Mappe une row audit_log vers une AutoEntryKind. Retourne 'unknown' si
 * le row ne matche aucun pattern connu — l UI le filtrera (no chip).
 *
 * Pure function (no IO) → testable simplement.
 */
export function mapAuditLogToAutoEntry(row: AuditLogRow): {
  kind: AutoEntryKind;
  content: string;
} {
  const after = row.after ?? {};
  const before = row.before ?? {};
  const kindHint = (after as { kind?: string }).kind;

  // 1. Hints explicites via after.kind (pattern P14.4 sur nouvelles actions).
  if (kindHint === 'status_changed') {
    const newStatus = (after as { status?: string }).status ?? '?';
    return { kind: 'status_changed', content: `Statut → ${newStatus}` };
  }
  if (kindHint === 'booth_assigned') {
    const booth = (after as { booth_assignment?: string }).booth_assignment ?? '?';
    return { kind: 'booth_assigned', content: `Emplacement → ${booth}` };
  }
  if (kindHint === 'booth_cleared') {
    return { kind: 'booth_cleared', content: 'Emplacement libéré' };
  }
  if (kindHint === 'stand_assigned') {
    const num = (after as { stand_number?: string }).stand_number ?? '?';
    const salle = (after as { stand_salle?: string }).stand_salle ?? '';
    return { kind: 'stand_assigned', content: `Stand → ${num}${salle ? ` (${salle})` : ''}` };
  }
  if (kindHint === 'stripe_payment_received') {
    const amt = (after as { amount_eur?: number }).amount_eur ?? 0;
    const type = (after as { payment_type?: string }).payment_type ?? 'paiement';
    const fmt = Math.round(amt).toLocaleString('fr-FR');
    return { kind: 'stripe_payment_received', content: `Paiement Stripe · ${fmt} € (${type})` };
  }
  if (kindHint === 'signup_converted') {
    const email = (after as { email?: string }).email ?? '';
    return {
      kind: 'signup_converted',
      content: `Signup web converti${email ? ` · ${email}` : ''}`,
    };
  }
  if (kindHint === 'quote_emit_success') {
    const num = (after as { devis_number?: string }).devis_number ?? '';
    return { kind: 'quote_emit_success', content: `Devis Sellsy émis${num ? ` · ${num}` : ''}` };
  }

  // 2. Pattern P14.4 "prospect_edited" : un seul audit_log avec sub-changes.
  // On émet 1 AutoEntry par sub-change (caller doit appeler ce mapper en
  // mode "expand"). Pour V1, on retourne juste le premier change détecté.
  if (kindHint === 'prospect_edited') {
    if ((after as { owner_changed?: unknown }).owner_changed) {
      return { kind: 'owner_changed', content: 'Owner modifié' };
    }
    if ((after as { status_changed?: { to?: string } }).status_changed) {
      const to = (after as { status_changed?: { to?: string } }).status_changed?.to ?? '?';
      return { kind: 'status_changed', content: `Statut → ${to}` };
    }
    if ((after as { pack_changed?: { to?: string } }).pack_changed) {
      const to = (after as { pack_changed?: { to?: string } }).pack_changed?.to ?? '?';
      return { kind: 'pack_changed', content: `Pack → ${to}` };
    }
    return { kind: 'unknown', content: 'Édition fiche' };
  }

  // 3. Fallback heuristiques pour les audit_log historiques (avant P14.4).
  if (row.entity_type === 'prospects' && row.action === 'update') {
    // Status legacy : before.status !== after.status mais sans kind.
    const beforeStatus = (before as { status?: string }).status;
    const afterStatus = (after as { status?: string }).status;
    if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
      return { kind: 'status_changed', content: `Statut → ${afterStatus}` };
    }
  }

  return { kind: 'unknown', content: `${row.entity_type} · ${row.action}` };
}

/**
 * P14.4 — timeline FULL = notes + calendar + audit_log (auto-entries).
 *
 * Strategie :
 *   1. getProspectTimeline (notes + calendar_events via view) — sans modif.
 *   2. SELECT audit_log WHERE entity_type='prospects' AND entity_id=$1.
 *   3. Map chaque row → AutoEntry, filtre les 'unknown' (= noise).
 *   4. Merge + tri par event_at DESC.
 *   5. Hydrate actors (bulk SELECT users) pour les rows ayant user_id.
 */
export async function getProspectTimelineFull(prospectId: string): Promise<TimelineEntry[]> {
  if (!prospectId) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const baseTimeline = await getProspectTimeline(prospectId);

  // 1. Read audit_log limité (200 derniers events relatifs au prospect).
  const { data: auditRows } = await supabase
    .from('audit_log')
    .select('id, user_id, entity_type, entity_id, action, before, after, created_at')
    .eq('entity_type', 'prospects')
    .eq('entity_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (auditRows ?? []) as AuditLogRow[];

  // 2. Hydrate actor users pour les rows audit.
  const auditUserIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const { data: users } =
    auditUserIds.length > 0
      ? await supabase.from('users').select('id, full_name, email').in('id', auditUserIds)
      : { data: [] };
  const usersMap = new Map<string, TimelineActor>(
    ((users ?? []) as TimelineActor[]).map((u) => [u.id, u]),
  );

  // 3. Map → AutoEntry (filtre unknown = noise).
  const autoEntries: TimelineEntry[] = [];
  for (const row of rows) {
    const { kind, content } = mapAuditLogToAutoEntry(row);
    if (kind === 'unknown') continue; // skip silently
    autoEntries.push({
      id: `audit-${row.id}`,
      prospect_id: prospectId,
      entry_type: 'auto',
      event_at: row.created_at,
      actor: row.user_id ? (usersMap.get(row.user_id) ?? null) : null,
      contact: null,
      content,
      calendar_event_type: null,
      calendar_event_status: null,
      calendar_event_start: null,
      calendar_event_end: null,
      auto_kind: kind,
      auto_payload: row.after,
    });
  }

  // 4. Merge + tri DESC par event_at.
  return [...baseTimeline, ...autoEntries].sort((a, b) =>
    a.event_at < b.event_at ? 1 : a.event_at > b.event_at ? -1 : 0,
  );
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
