'use server';

/**
 * P8.2 — server actions self-service pour le contact connecte
 * (espace-partenaire JWT cookie). Pour les preferences email, voir
 * lib/admin/contact-preferences/actions.ts (updateMyPreferencesAction).
 *
 * Actions :
 *   - updateMyContactProfileAction : edition prenom/nom/tel/langue.
 *     L'email reste read-only (= identifiant de login).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[espace-partenaire/profile-actions]';

const updateSchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  first_name: z.string().trim().min(1).max(120).optional().or(z.literal('')),
  last_name: z.string().trim().min(1).max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  language: z.enum(['FR', 'EN']).optional(),
});

export async function updateMyContactProfileAction(
  input: z.input<typeof updateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }

  let contactId: string;
  try {
    const session = await requireContactSession(parsed.data.locale);
    contactId = session.contactId;
    if (!contactId) {
      return { ok: false, error: 'Session contact non resolue.' };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.first_name !== undefined)
    patch.first_name = parsed.data.first_name === '' ? null : parsed.data.first_name;
  if (parsed.data.last_name !== undefined)
    patch.last_name = parsed.data.last_name === '' ? null : parsed.data.last_name;
  if (parsed.data.phone !== undefined)
    patch.phone = parsed.data.phone === '' ? null : parsed.data.phone;
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;

  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('contacts')
    .update(patch as never)
    .eq('id', contactId);
  if (error) {
    console.warn('%s update-failed contact=%s msg=%s', LOG_PREFIX, contactId, error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/${parsed.data.locale}/espace-partenaire/dashboard/profil`);
  return { ok: true };
}
