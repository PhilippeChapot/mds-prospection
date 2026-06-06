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

// ─── Schemas Zod ───

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
    } as never)
    .select('*')
    .single();

  if (error) {
    // EXCLUDE constraint DB → 23P01. Si on arrive ici malgre le check
    // applicatif, c est une race condition → on remappe en overlap.
    if (error.code === '23P01') {
      return {
        ok: false,
        error: 'Creneau deja occupe (detection DB en backup).',
        errorCode: 'overlap',
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
    .select('id, user_id, start_at, end_at, status, prospect_id')
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
    .select('id, user_id, prospect_id')
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

  if (targetUserId) query = query.eq('user_id', targetUserId);
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
