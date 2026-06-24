'use server';

/**
 * P14.1.SalesCalendarCore — server actions CRUD calendrier sales.
 *
 * RBAC :
 *   - admin / sales / super_admin peuvent creer pour eux-meme.
 *   - super_admin peut filtrer/lister par user_id arbitraire +
 *     forcer un overlap (champ force_overlap).
 *   - Les admins reguliers + sales ne voient que leurs propres events.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * n exporte QUE des async functions. Les helpers + types vivent dans
 * ./helpers.ts.
 *
 * Audit log : kind=calendar_event_* sur insert/update/delete pour traque.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile, type AdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { checkOverlap, type CalendarEventRow, type CalendarEventStatus } from './helpers';
import { pushEventBestEffort, deleteEventFromGoogle } from './google/push-sync';
import { sendExternalInvitesForEvent } from './external-invites';

// ─── Types partagés ───

export type ContactSuggestion = {
  id: string | null;
  email: string;
  displayName: string;
  isCompanyContact: boolean;
};

// ─── Schemas Zod ───

const attendeeInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().max(200).nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  event_type: z.enum(['call_relance', 'meeting', 'task']),
  prospect_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().nullable().optional(),
  is_all_day: z.boolean().default(false),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  force_overlap: z.boolean().default(false),
  /** Surcharge super_admin only — creer pour un autre user. */
  target_user_id: z.string().uuid().optional(),
  /** P14.2 — génère un lien Google Meet (meeting + Google connecté). */
  generate_meet: z.boolean().default(false),
  /** P14.2 #9 — liste des invités (max 50). */
  attendees: z.array(attendeeInputSchema).max(50).default([]),
  /** P14.5 — assignataires (admin/super_admin seulement). */
  assignee_user_ids: z.array(z.string().uuid()).max(20).default([]),
});

const updateSchema = createSchema
  .extend({
    id: z.string().uuid(),
    status: z.enum(['pending', 'done', 'cancelled', 'missed']).optional(),
    outcome: z.string().trim().max(500).nullable().optional(),
  })
  .partial({
    event_type: true,
    title: true,
    start_at: true,
  });

const listSchema = z.object({
  start_range: z.string().datetime(),
  end_range: z.string().datetime(),
  user_id: z.string().uuid().optional(),
  event_type: z.enum(['call_relance', 'meeting', 'task']).optional(),
  status: z.enum(['pending', 'done', 'cancelled', 'missed']).optional(),
  prospect_id: z.string().uuid().optional(),
});

const markDoneSchema = z.object({
  id: z.string().uuid(),
  outcome: z.string().trim().max(500).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

// ─── Result types ───

export type CalendarActionSuccess<T = CalendarEventRow> = {
  ok: true;
  event?: T;
  events?: T[];
};

export type CalendarActionFailure = {
  ok: false;
  error: string;
  errorCode?:
    | 'forbidden'
    | 'overlap'
    | 'super_admin_required'
    | 'not_found'
    | 'validation'
    | 'end_after_start'
    | 'internal';
  conflictEvent?: {
    id: string;
    title: string;
    start_at: string;
    end_at: string | null;
  };
};

export type CalendarActionResult<T = CalendarEventRow> =
  | CalendarActionSuccess<T>
  | CalendarActionFailure;

// ─── Helpers internes ───

function isSuperAdmin(profile: AdminProfile): boolean {
  return profile.role === 'super_admin';
}

/**
 * Pour determiner le user_id propriétaire de l event a CRUD-er :
 *   - Si profile.role = super_admin ET target_user_id fourni → target.
 *   - Sinon (sales/admin OU super_admin sans target) → profile.id.
 *
 * Empeche un sales/admin de creer pour un autre user (RBAC).
 */
function resolveTargetUserId(
  profile: AdminProfile,
  targetUserId?: string,
): { ok: true; userId: string } | CalendarActionFailure {
  if (!targetUserId || targetUserId === profile.id) {
    return { ok: true, userId: profile.id };
  }
  if (!isSuperAdmin(profile)) {
    return {
      ok: false,
      error: 'Seul un super_admin peut creer un event pour un autre utilisateur.',
      errorCode: 'forbidden',
    };
  }
  return { ok: true, userId: targetUserId };
}

// ─── CREATE ───

export async function createCalendarEventAction(
  input: z.input<typeof createSchema>,
): Promise<CalendarActionResult> {
  const profile = await requireAdminProfile();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
      errorCode: 'validation',
    };
  }
  const data = parsed.data;

  const resolved = resolveTargetUserId(profile, data.target_user_id);
  if (!resolved.ok) return resolved;

  const startAt = new Date(data.start_at);
  const endAt = data.end_at ? new Date(data.end_at) : null;

  // Anti-overlap applicatif (sauf si super_admin force).
  if (endAt) {
    if (data.force_overlap && !isSuperAdmin(profile)) {
      return {
        ok: false,
        error: 'Seul un super_admin peut forcer un creneau deja occupe.',
        errorCode: 'super_admin_required',
      };
    }
    if (!data.force_overlap) {
      const conflict = await checkOverlap(resolved.userId, startAt, endAt);
      if (conflict) {
        return {
          ok: false,
          error: `Creneau deja occupe : « ${conflict.title} »`,
          errorCode: 'overlap',
          conflictEvent: {
            id: conflict.id,
            title: conflict.title,
            start_at: conflict.start_at,
            end_at: conflict.end_at,
          },
        };
      }
    }
  }

  const supabase = getSupabaseServiceClient();
  const { data: created, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: resolved.userId,
      prospect_id: data.prospect_id ?? null,
      event_type: data.event_type,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      start_at: startAt.toISOString(),
      end_at: endAt ? endAt.toISOString() : null,
      is_all_day: data.is_all_day,
      priority: data.priority,
      created_by_user_id: profile.id,
      attendees: data.attendees ?? [],
      assignee_user_ids: data.assignee_user_ids ?? [],
    } as never)
    .select('*')
    .single();

  if (error) {
    // EXCLUDE constraint DB → 23P01 (overlap, race condition).
    if (error.code === '23P01') {
      return {
        ok: false,
        error: 'Creneau deja occupe (detection DB en backup).',
        errorCode: 'overlap',
      };
    }
    // CHECK constraint calendar_events_end_after_start → 23514.
    // Cas rare car la validation client + Zod attrappe en amont, mais
    // defense en profondeur : remap en message friendly plutot que
    // d exposer le message Postgres brut.
    if (error.code === '23514' && /end_after_start/i.test(error.message ?? '')) {
      return {
        ok: false,
        error: 'La date de fin doit etre apres la date de debut.',
        errorCode: 'end_after_start',
      };
    }
    return { ok: false, error: `Create: ${error.message}`, errorCode: 'internal' };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: created.id,
    action: 'create',
    after: {
      kind: 'calendar_event_created',
      event_type: data.event_type,
      target_user_id: resolved.userId,
      prospect_id: data.prospect_id ?? null,
      forced_overlap: data.force_overlap,
    } as never,
  });

  // P14.2 — push best-effort vers Google (awaité : meet_url dispo au refetch,
  // le cron retry est le filet si l'API Google échoue). No-op si non connecté.
  await pushEventBestEffort(
    created as CalendarEventRow,
    data.generate_meet === true && data.event_type === 'meeting',
  );

  // P14.x — invitations externes (.ics) : RDV uniquement (gate dans le helper),
  // best-effort. Les Appels/tâches ne déclenchent JAMAIS d'email tiers.
  await sendExternalInvitesForEvent(supabase, created as CalendarEventRow, 'invitation');

  revalidatePath('/admin/calendar');
  if (data.prospect_id) revalidatePath(`/admin/prospects/${data.prospect_id}`);
  return { ok: true, event: created as CalendarEventRow };
}

// ─── UPDATE ───

export async function updateCalendarEventAction(
  input: z.input<typeof updateSchema>,
): Promise<CalendarActionResult> {
  const profile = await requireAdminProfile();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
      errorCode: 'validation',
    };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: current, error: readErr } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', data.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message, errorCode: 'internal' };
  if (!current) return { ok: false, error: 'Event introuvable.', errorCode: 'not_found' };

  // RBAC : seul le proprietaire OU super_admin peut update.
  if (current.user_id !== profile.id && !isSuperAdmin(profile)) {
    return {
      ok: false,
      error: 'Reserve au proprietaire de l event ou au super_admin.',
      errorCode: 'forbidden',
    };
  }

  const newStartAt = data.start_at ? new Date(data.start_at) : new Date(current.start_at);
  const newEndAt =
    data.end_at !== undefined
      ? data.end_at
        ? new Date(data.end_at)
        : null
      : current.end_at
        ? new Date(current.end_at)
        : null;
  const newStatus = data.status ?? (current.status as CalendarEventStatus);

  // Anti-overlap : si on a un end_at + status pending → check.
  if (newEndAt && newStatus !== 'cancelled' && newStatus !== 'done') {
    if (data.force_overlap && !isSuperAdmin(profile)) {
      return {
        ok: false,
        error: 'Seul un super_admin peut forcer un creneau deja occupe.',
        errorCode: 'super_admin_required',
      };
    }
    if (!data.force_overlap) {
      const conflict = await checkOverlap(current.user_id, newStartAt, newEndAt, data.id);
      if (conflict) {
        return {
          ok: false,
          error: `Creneau deja occupe : « ${conflict.title} »`,
          errorCode: 'overlap',
          conflictEvent: {
            id: conflict.id,
            title: conflict.title,
            start_at: conflict.start_at,
            end_at: conflict.end_at,
          },
        };
      }
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.event_type !== undefined) updates.event_type = data.event_type;
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.location !== undefined) updates.location = data.location;
  if (data.start_at !== undefined) updates.start_at = newStartAt.toISOString();
  if (data.end_at !== undefined) updates.end_at = newEndAt ? newEndAt.toISOString() : null;
  if (data.is_all_day !== undefined) updates.is_all_day = data.is_all_day;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.status !== undefined) updates.status = data.status;
  if (data.outcome !== undefined) updates.outcome = data.outcome;
  if (data.prospect_id !== undefined) updates.prospect_id = data.prospect_id;
  if (data.attendees !== undefined) updates.attendees = data.attendees;
  if (data.assignee_user_ids !== undefined) updates.assignee_user_ids = data.assignee_user_ids;

  // P14.x — bump SEQUENCE iCalendar pour les RDV (clients mail honorent l'UPDATE).
  const willBeMeeting = (data.event_type ?? current.event_type) === 'meeting';
  if (willBeMeeting) {
    updates.invite_sequence = ((current as { invite_sequence?: number }).invite_sequence ?? 0) + 1;
  }

  const { data: updated, error: updErr } = await supabase
    .from('calendar_events')
    .update(updates as never)
    .eq('id', data.id)
    .select('*')
    .single();

  if (updErr) {
    if (updErr.code === '23P01') {
      return {
        ok: false,
        error: 'Creneau deja occupe (detection DB en backup).',
        errorCode: 'overlap',
      };
    }
    if (updErr.code === '23514' && /end_after_start/i.test(updErr.message ?? '')) {
      return {
        ok: false,
        error: 'La date de fin doit etre apres la date de debut.',
        errorCode: 'end_after_start',
      };
    }
    return { ok: false, error: updErr.message, errorCode: 'internal' };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: data.id,
    action: 'update',
    after: {
      kind: 'calendar_event_updated',
      changes: Object.keys(updates).filter((k) => k !== 'updated_at'),
    } as never,
  });

  // P14.2 — propage la modif vers Google (awaité best-effort). Si l'event a
  // été lié (google_calendar_event_id présent dans `updated`), push fait un
  // update Google ; sinon insert. Meet conservé via generate_meet.
  await pushEventBestEffort(
    updated as CalendarEventRow,
    data.generate_meet === true && (updated as CalendarEventRow).event_type === 'meeting',
  );

  // P14.x — notifie les invités externes (RDV only, gate dans le helper). Un
  // event passé à 'cancelled' envoie une annulation, sinon une mise à jour.
  {
    const ev = updated as CalendarEventRow;
    const kind = ev.status === 'cancelled' ? 'cancellation' : 'update';
    await sendExternalInvitesForEvent(supabase, ev, kind);
  }

  revalidatePath('/admin/calendar');
  if (current.prospect_id) revalidatePath(`/admin/prospects/${current.prospect_id}`);
  return { ok: true, event: updated as CalendarEventRow };
}

// ─── DELETE ───

export async function deleteCalendarEventAction(
  input: z.input<typeof deleteSchema>,
): Promise<CalendarActionResult> {
  const profile = await requireAdminProfile();
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'id invalide', errorCode: 'validation' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: current } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Event introuvable.', errorCode: 'not_found' };

  if (current.user_id !== profile.id && !isSuperAdmin(profile)) {
    return {
      ok: false,
      error: 'Reserve au proprietaire ou au super_admin.',
      errorCode: 'forbidden',
    };
  }

  // P14.x — annulation aux invités externes AVANT suppression (RDV only, gate
  // dans le helper). On lit l'event complet ci-dessus pour disposer des attendees.
  await sendExternalInvitesForEvent(supabase, current as CalendarEventRow, 'cancellation');

  // P14.2 — supprime d'abord côté Google (best-effort, 404/410 = déjà absent).
  const googleEventId = (current as { google_calendar_event_id?: string | null })
    .google_calendar_event_id;
  if (googleEventId) {
    try {
      const r = await deleteEventFromGoogle(current.user_id, googleEventId);
      if (!r.ok) {
        console.warn('[calendar/delete] google-delete-failed event=%s err=%s', current.id, r.error);
      }
    } catch (err) {
      console.warn(
        '[calendar/delete] google-delete-error event=%s msg=%s',
        current.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const { error } = await supabase.from('calendar_events').delete().eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message, errorCode: 'internal' };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: parsed.data.id,
    action: 'delete',
    after: { kind: 'calendar_event_deleted' } as never,
  });

  revalidatePath('/admin/calendar');
  if (current.prospect_id) revalidatePath(`/admin/prospects/${current.prospect_id}`);
  return { ok: true };
}

// ─── RESEND INVITES (P14.x) ───

const resendSchema = z.object({
  eventId: z.string().uuid(),
  scope: z
    .union([z.literal('all'), z.literal('pending'), z.object({ email: z.string().email() })])
    .default('all'),
});

export async function resendEventInvitesAction(
  input: z.input<typeof resendSchema>,
): Promise<
  { ok: true; sent: number; total: number; gated: boolean } | { ok: false; error: string }
> {
  const profile = await requireAdminProfile();
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Paramètres invalides' };
  const { eventId, scope } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: event } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Event introuvable.' };
  if (event.user_id !== profile.id && !isSuperAdmin(profile)) {
    return { ok: false, error: 'Réservé au propriétaire ou au super_admin.' };
  }
  const res = await sendExternalInvitesForEvent(
    supabase,
    event as CalendarEventRow,
    'invitation',
    scope,
  );
  if (res.gated) {
    return { ok: false, error: 'Invitations réservées aux RDV (pas aux appels/tâches).' };
  }

  // Action sensible (envoi email manuel) → audit log.
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: eventId,
    action: 'update',
    after: {
      kind: 'calendar_invites_resent',
      scope: typeof scope === 'object' ? `email:${scope.email}` : scope,
      sent: res.sent,
      total: res.total,
    } as never,
  });

  return { ok: true, sent: res.sent, total: res.total, gated: false };
}

// ─── LIST ───

export async function listCalendarEventsAction(
  input: z.input<typeof listSchema>,
): Promise<CalendarActionResult> {
  const profile = await requireAdminProfile();
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
      errorCode: 'validation',
    };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  // RBAC : si user_id fourni et != profile.id → super_admin only.
  // Si user_id absent → on retourne les events du profil courant
  // (sauf super_admin qui peut alors voir tous, voir ci-dessous).
  let targetUserId: string | undefined = data.user_id ?? profile.id;
  if (data.user_id && data.user_id !== profile.id && !isSuperAdmin(profile)) {
    return {
      ok: false,
      error: 'Reserve aux super_admin pour voir le calendrier d un autre user.',
      errorCode: 'forbidden',
    };
  }
  // Super_admin sans filter user_id explicite → lit TOUS les events.
  if (!data.user_id && isSuperAdmin(profile)) {
    targetUserId = undefined;
  }

  let query = supabase
    .from('calendar_events')
    .select('*')
    .gte('start_at', data.start_range)
    .lte('start_at', data.end_range)
    .order('start_at', { ascending: true });

  // P14.5 : inclut les events dont l'utilisateur est assignataire.
  if (targetUserId) {
    query = query.or(`user_id.eq.${targetUserId},assignee_user_ids.cs.{${targetUserId}}`);
  }
  if (data.event_type) query = query.eq('event_type', data.event_type);
  if (data.status) query = query.eq('status', data.status);
  if (data.prospect_id) query = query.eq('prospect_id', data.prospect_id);

  const { data: rows, error } = await query;
  if (error) return { ok: false, error: error.message, errorCode: 'internal' };

  return { ok: true, events: (rows ?? []) as CalendarEventRow[] };
}

// ─── MARK DONE ───

export async function markCalendarEventDoneAction(
  input: z.input<typeof markDoneSchema>,
): Promise<CalendarActionResult> {
  const profile = await requireAdminProfile();
  const parsed = markDoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Donnees invalides', errorCode: 'validation' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: current } = await supabase
    .from('calendar_events')
    .select('id, user_id, prospect_id, status')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Event introuvable.', errorCode: 'not_found' };
  if (current.user_id !== profile.id && !isSuperAdmin(profile)) {
    return {
      ok: false,
      error: 'Reserve au proprietaire ou au super_admin.',
      errorCode: 'forbidden',
    };
  }
  if (current.status === 'done') {
    return { ok: false, error: 'Event deja marque comme done.', errorCode: 'validation' };
  }

  const { data: updated, error } = await supabase
    .from('calendar_events')
    .update({
      status: 'done',
      outcome: parsed.data.outcome ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message, errorCode: 'internal' };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: parsed.data.id,
    action: 'update',
    after: {
      kind: 'calendar_event_marked_done',
      outcome: parsed.data.outcome ?? null,
    } as never,
  });

  revalidatePath('/admin/calendar');
  if (current.prospect_id) revalidatePath(`/admin/prospects/${current.prospect_id}`);
  return { ok: true, event: updated as CalendarEventRow };
}

// ─── SEARCH CONTACTS (pour la section Invités) ───

/**
 * P14.2 #9 — cherche des contacts MDS à ajouter comme invités.
 *
 * Stratégie :
 *   1. Si prospect_id fourni : charge d'abord les contacts de la company
 *      du prospect (priorité + label isCompanyContact=true).
 *   2. Si query >= 2 chars : appelle la RPC search_contacts_fuzzy.
 *   3. Merge : company contacts (filtrés par query) + fuzzy (dédupliqués).
 *   4. Filtre les exclude_emails (déjà sélectionnés).
 */
export async function searchContactsForCalendarAction(input: {
  query: string;
  prospect_id?: string | null;
  exclude_emails?: string[];
}): Promise<{ ok: true; data: ContactSuggestion[] } | { ok: false; error: string }> {
  await requireAdminProfile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  const q = (input.query ?? '').trim().toLowerCase();
  const excludeSet = new Set((input.exclude_emails ?? []).map((e) => e.toLowerCase()));

  // 1. Contacts de la company du prospect lié.
  let companyContacts: ContactSuggestion[] = [];
  if (input.prospect_id) {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('company_id')
      .eq('id', input.prospect_id)
      .maybeSingle();
    if (prospect?.company_id) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name')
        .eq('company_id', prospect.company_id)
        .not('email', 'is', null)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);
      type CRow = {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
      };
      companyContacts = ((contacts ?? []) as CRow[])
        .filter((c) => c.email)
        .filter((c) => !excludeSet.has(c.email.toLowerCase()))
        .filter(
          (c) =>
            !q ||
            c.email.toLowerCase().includes(q) ||
            [c.first_name, c.last_name].join(' ').toLowerCase().includes(q),
        )
        .map((c) => ({
          id: c.id,
          email: c.email,
          displayName: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email,
          isCompanyContact: true,
        }));
    }
  }

  // 2. Fuzzy search RPC si query >= 2 chars.
  let fuzzyContacts: ContactSuggestion[] = [];
  if (q.length >= 2) {
    const { data } = await supabase.rpc('search_contacts_fuzzy', {
      p_query: q,
      p_limit_exact: 10,
      p_limit_fuzzy: 5,
    });
    type FRow = { id: string; email: string; first_name: string | null; last_name: string | null };
    const companyIds = new Set(companyContacts.map((c) => c.id));
    fuzzyContacts = ((data ?? []) as FRow[])
      .filter((r) => r.email && !excludeSet.has(r.email.toLowerCase()))
      .filter((r) => !companyIds.has(r.id))
      .map((r) => ({
        id: r.id,
        email: r.email,
        displayName: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email,
        isCompanyContact: false,
      }));
  }

  // 3. Merge : company contacts en premier (max 20 total).
  const merged = [...companyContacts, ...fuzzyContacts].slice(0, 20);
  return { ok: true, data: merged };
}
