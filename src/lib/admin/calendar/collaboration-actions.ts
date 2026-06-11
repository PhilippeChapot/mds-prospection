'use server';

/**
 * P14.5.CalendarCollaboration — server actions pour assignation + visibilité.
 *
 * RBAC :
 *   - assignEventToUsersAction : admin/super_admin seulement.
 *   - toggleCalendarVisibilityAction : tous rôles (chacun gère sa visibilité).
 *   - listVisibleCalendarUsersAction : tous rôles.
 *   - listAdminUsersForCalendarAction : tous rôles (lecture seule).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderCalendarUrgentAlertTemplate } from '@/lib/resend/templates/calendar-urgent-alert';

// ─── Types ───

type CollabResult = { ok: true } | { ok: false; error: string };

export type AdminUserSummary = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

// ─── Schemas ───

const assignSchema = z.object({
  event_id: z.string().uuid(),
  assignee_user_ids: z.array(z.string().uuid()).max(20),
  notify_urgent: z.boolean().default(false),
});

const visibilitySchema = z.object({
  visible_user_id: z.string().uuid(),
});

// ─── ASSIGN EVENT ───

export async function assignEventToUsersAction(
  input: z.input<typeof assignSchema>,
): Promise<CollabResult> {
  const profile = await requireAdminProfile();

  if (profile.role === 'sales') {
    return { ok: false, error: 'Les sales ne peuvent pas assigner des évènements.' };
  }

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  // Vérifie propriété de l'event
  const { data: event, error: fetchErr } = await supabase
    .from('calendar_events')
    .select('id, user_id, title, start_at')
    .eq('id', data.event_id)
    .maybeSingle();

  if (fetchErr || !event) {
    return { ok: false, error: 'Évènement introuvable.' };
  }

  if (profile.role !== 'super_admin' && event.user_id !== profile.id) {
    return { ok: false, error: "Accès refusé : vous n'êtes pas propriétaire de cet évènement." };
  }

  const { error: updateErr } = await supabase
    .from('calendar_events')
    .update({ assignee_user_ids: data.assignee_user_ids } as never)
    .eq('id', data.event_id);

  if (updateErr) return { ok: false, error: updateErr.message };

  // Audit
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'calendar_events',
    entity_id: data.event_id,
    action: 'event_assigned' as never,
    after: { kind: 'event_assigned', assignee_user_ids: data.assignee_user_ids } as never,
  });

  // Alerte email urgente
  if (data.notify_urgent && data.assignee_user_ids.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name, language')
      .in('id', data.assignee_user_ids);

    const { data: assigner } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', profile.id)
      .maybeSingle();

    const assignerName = assigner?.full_name ?? assigner?.email ?? 'Un admin';

    for (const user of users ?? []) {
      const locale = (user.language ?? 'FR').toLowerCase() === 'en' ? 'en' : 'fr';
      const tpl = renderCalendarUrgentAlertTemplate(locale, {
        firstName: user.full_name ?? user.email ?? '',
        eventTitle: event.title,
        eventStart: event.start_at,
        assignerName,
      });
      try {
        await sendTransactionalEmailViaResend({
          to: user.email,
          toName: user.full_name ?? undefined,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: 'template', value: 'calendar-urgent-alert' }],
        });
      } catch (err) {
        console.error('[calendar-collaboration] urgent email failed for', user.email, err);
      }
    }
  }

  revalidatePath('/admin/calendar');
  return { ok: true };
}

// ─── TOGGLE CALENDAR VISIBILITY ───

export async function toggleCalendarVisibilityAction(
  input: z.input<typeof visibilitySchema>,
): Promise<CollabResult> {
  const profile = await requireAdminProfile();
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const { visible_user_id } = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('user_calendar_visibility')
    .select('user_id')
    .eq('user_id', profile.id)
    .eq('visible_user_id', visible_user_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_calendar_visibility')
      .delete()
      .eq('user_id', profile.id)
      .eq('visible_user_id', visible_user_id);
  } else {
    await supabase
      .from('user_calendar_visibility')
      .insert({ user_id: profile.id, visible_user_id });
  }

  return { ok: true };
}

// ─── LIST VISIBLE CALENDAR USERS ───

export async function listVisibleCalendarUsersAction(): Promise<
  { ok: true; visibleUserIds: string[] } | { ok: false; error: string }
> {
  const profile = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('user_calendar_visibility')
    .select('visible_user_id')
    .eq('user_id', profile.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, visibleUserIds: (data ?? []).map((r) => r.visible_user_id) };
}

// ─── LIST ADMIN USERS (pour multi-select assignataires) ───

export async function listAdminUsersForCalendarAction(): Promise<
  { ok: true; users: AdminUserSummary[] } | { ok: false; error: string }
> {
  const profile = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'sales', 'super_admin'])
    .order('full_name', { ascending: true });

  if (error) return { ok: false, error: error.message };

  // Exclure soi-même de la liste d'assignataires
  const others = (data ?? []).filter((u) => u.id !== profile.id);
  return { ok: true, users: others as AdminUserSummary[] };
}
