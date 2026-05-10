'use server';

/**
 * Server actions Espace Exposant V1.1 — P5.x.10.
 *
 * Auth via cookie session (verifie par loadDashboardData) plutot que
 * via admin role. L'exposant peut uniquement editer son propre contact
 * (filtre via prospect.primary_contact_id du cookie).
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifySessionToken, ESPACE_EXPOSANT_SESSION_COOKIE } from '@/lib/espace-exposant/jwt';

const updateContactSchema = z.object({
  phone: z.string().trim().max(40).nullable(),
  role: z.string().trim().max(120).nullable(),
});

export interface UpdateContactResult {
  ok: boolean;
  error?: string;
}

/**
 * Modifie phone + role du contact rattache au prospect courant.
 * Email + first_name + last_name restent immuables (identite stable —
 * pour les changer, contacter Phil).
 */
export async function updateExposantContactAction(input: {
  phone: string | null;
  role: string | null;
}): Promise<UpdateContactResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return { ok: false, error: 'unauthorized' };
  }

  let prospectId: string;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    prospectId = claims.prospectId;
  } catch {
    return { ok: false, error: 'invalid_session' };
  }

  const parsed = updateContactSchema.safeParse({
    phone: input.phone ?? null,
    role: input.role ?? null,
  });
  if (!parsed.success) {
    return { ok: false, error: 'invalid_payload' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('primary_contact_id')
    .eq('id', prospectId)
    .maybeSingle();

  if (!prospect?.primary_contact_id) {
    return { ok: false, error: 'no_contact' };
  }

  const { error } = await supabase
    .from('contacts')
    .update({
      phone: parsed.data.phone || null,
      role: parsed.data.role || null,
    })
    .eq('id', prospect.primary_contact_id);

  if (error) {
    console.error(
      '[espace-exposant/updateContact] update-failed prospect=%s msg=%s',
      prospectId,
      error.message,
    );
    return { ok: false, error: error.message };
  }

  revalidatePath('/fr/espace-exposant/dashboard');
  revalidatePath('/en/espace-exposant/dashboard');
  return { ok: true };
}
