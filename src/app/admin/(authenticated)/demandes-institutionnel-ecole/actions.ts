'use server';

/**
 * P6.x.4-a — server actions admin pour /admin/demandes-institutionnel-ecole.
 * Update status + admin_notes. Toujours réservé aux admins (pas sales).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[admin/demandes-institutionnel-ecole]';

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'contacted', 'devis_sent', 'won', 'lost']).optional(),
  admin_notes: z.string().trim().max(4000).optional(),
});

export type UpdateInput = z.infer<typeof updateSchema>;
export type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateInstitutionnelEcoleRequest(input: UpdateInput): Promise<UpdateResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') return { ok: false, error: 'Forbidden' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };

  const patch: {
    updated_at: string;
    status?: 'new' | 'contacted' | 'devis_sent' | 'won' | 'lost';
    admin_notes?: string | null;
  } = { updated_at: new Date().toISOString() };
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.admin_notes !== undefined) patch.admin_notes = parsed.data.admin_notes || null;

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('institutionnel_ecole_requests')
    .update(patch)
    .eq('id', parsed.data.id);

  if (error) {
    console.error('%s update-failed id=%s msg=%s', LOG_PREFIX, parsed.data.id, error.message);
    return { ok: false, error: error.message };
  }

  console.log('%s updated id=%s patch=%j', LOG_PREFIX, parsed.data.id, patch);
  revalidatePath('/admin/demandes-institutionnel-ecole');
  return { ok: true };
}
