'use server';

/**
 * P14.1.SalesCalendarCore (Commit 5) — server actions pour gerer le token
 * .ics personnel de l user (subscription Apple/Google Calendar).
 *
 * Le token est un UUID v4 stocke dans users.calendar_ics_token (migration
 * 0082). regenerateIcsTokenAction invalide l ancien et en cree un nouveau.
 * getIcsTokenAction lit le token courant (genere a la 1ere lecture si
 * absent).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : exports
 * async only.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type IcsTokenResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * Lit le token courant de l user. Si absent, le genere a la 1ere demande
 * (lazy create) — c est ce qui permet a la settings UI d afficher
 * l URL immediatement sans bouton "Activer".
 */
export async function getIcsTokenAction(): Promise<IcsTokenResult> {
  const profile = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: user, error: readErr } = await supabase
    .from('users')
    .select('calendar_ics_token')
    .eq('id', profile.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (user?.calendar_ics_token) {
    return { ok: true, token: user.calendar_ics_token };
  }

  // Lazy create.
  const newToken = randomUUID();
  const { error: updErr } = await supabase
    .from('users')
    .update({ calendar_ics_token: newToken } as never)
    .eq('id', profile.id);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, token: newToken };
}

/**
 * Regenere le token : invalide l ancien (l URL .ics existante retourne
 * 404), genere un UUID v4 random, return le nouveau.
 *
 * Audit log : kind=calendar_ics_token_regenerated.
 */
export async function regenerateIcsTokenAction(): Promise<IcsTokenResult> {
  const profile = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const newToken = randomUUID();
  const { error } = await supabase
    .from('users')
    .update({ calendar_ics_token: newToken } as never)
    .eq('id', profile.id);
  if (error) return { ok: false, error: error.message };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'users',
    entity_id: profile.id,
    action: 'update',
    after: { kind: 'calendar_ics_token_regenerated' } as never,
  });

  revalidatePath('/admin/calendar/settings');
  return { ok: true, token: newToken };
}
