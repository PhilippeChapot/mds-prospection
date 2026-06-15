'use server';

/**
 * P15.1.VisitorModel — update / delete d'un visiteur.
 * Service-role + garde requireAdminProfile() + audit_log.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { POLE_CODES } from '@/lib/design-tokens';
import { VISITOR_TYPES, VISITOR_STATUSES, VISITOR_LANGUAGES } from '@/lib/visitors/constants';

const UpdateVisitorSchema = z.object({
  pole: z.enum(POLE_CODES).nullable().optional(),
  visitor_type: z.enum(VISITOR_TYPES).nullable().optional(),
  is_vip: z.boolean().optional(),
  status: z.enum(VISITOR_STATUSES).optional(),
  language: z.enum(VISITOR_LANGUAGES).optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type UpdateVisitorInput = z.input<typeof UpdateVisitorSchema>;

export async function updateVisitorAction(
  visitorId: string,
  input: UpdateVisitorInput,
): Promise<{ success: true }> {
  const profile = await requireAdminProfile();
  if (!/^[0-9a-f-]{36}$/i.test(visitorId)) throw new Error('ID visiteur invalide.');
  const patch = UpdateVisitorSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  const { data: before } = await supabase
    .from('visitors')
    .select('pole, visitor_type, is_vip, status, language, owner_user_id, notes')
    .eq('id', visitorId)
    .maybeSingle();
  if (!before) throw new Error('Visiteur introuvable.');

  const { error } = await supabase
    .from('visitors')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', visitorId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'visitors',
    entity_id: visitorId,
    action: 'update',
    before,
    after: { kind: 'visitor_edited', ...patch },
  });

  revalidatePath('/admin/visitors');
  revalidatePath(`/admin/visitors/${visitorId}`);
  return { success: true };
}

export async function deleteVisitorAction(visitorId: string): Promise<{ success: true }> {
  const profile = await requireAdminProfile();
  if (!/^[0-9a-f-]{36}$/i.test(visitorId)) throw new Error('ID visiteur invalide.');
  const supabase = getSupabaseServiceClient();

  const { data: before } = await supabase
    .from('visitors')
    .select('id, contact_id, company_id, status')
    .eq('id', visitorId)
    .maybeSingle();
  if (!before) throw new Error('Visiteur introuvable.');

  const { error } = await supabase.from('visitors').delete().eq('id', visitorId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'visitors',
    entity_id: visitorId,
    action: 'delete',
    before,
    after: { kind: 'visitor_deleted' },
  });

  revalidatePath('/admin/visitors');
  return { success: true };
}
