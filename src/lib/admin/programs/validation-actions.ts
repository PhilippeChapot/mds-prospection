'use server';

/**
 * P16.x.ImportPrograms — validation des entités importées.
 *   validate{Speaker,Conference}Action      : 1 entité (admin).
 *   bulkValidate{Speakers,Conferences}Action : lot (super_admin, max 100).
 * audit_log : after.kind = *_validated / *_bulk_validated.
 */

import { revalidatePath } from 'next/cache';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const UUID = /^[0-9a-f-]{36}$/i;
const BULK_MAX = 100;

async function validateOne(
  table: 'speakers' | 'conferences',
  id: string,
  kind: string,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  if (!UUID.test(id)) throw new Error('ID invalide.');
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from(table)
    .update({
      is_validated: true,
      validated_at: new Date().toISOString(),
      validated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: table,
    entity_id: id,
    before: null,
    after: { kind },
  });

  revalidatePath(`/admin/${table}`);
  revalidatePath(`/admin/${table}/${id}`);
  return { success: true };
}

export async function validateSpeakerAction(speakerId: string) {
  return validateOne('speakers', speakerId, 'speaker_validated');
}

export async function validateConferenceAction(conferenceId: string) {
  return validateOne('conferences', conferenceId, 'conference_validated');
}

async function bulkValidate(
  table: 'speakers' | 'conferences',
  ids: string[],
  kind: string,
): Promise<{ success: true; updated: number }> {
  const admin = await requireSuperAdmin();
  const clean = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, BULK_MAX);
  if (clean.length === 0) return { success: true, updated: 0 };
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from(table)
    .update({
      is_validated: true,
      validated_at: new Date().toISOString(),
      validated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .in('id', clean)
    .select('id');
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: table,
    entity_id: null,
    before: null,
    after: { kind, count: data?.length ?? 0 },
  });

  revalidatePath(`/admin/${table}`);
  return { success: true, updated: data?.length ?? 0 };
}

export async function bulkValidateSpeakersAction(ids: string[]) {
  return bulkValidate('speakers', ids, 'speaker_bulk_validated');
}

export async function bulkValidateConferencesAction(ids: string[]) {
  return bulkValidate('conferences', ids, 'conference_bulk_validated');
}
