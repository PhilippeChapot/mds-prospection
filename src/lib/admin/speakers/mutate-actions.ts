'use server';

/**
 * P16.1 — update / confirm / decline / delete speakers.
 * Service-role + requireAdminProfile() ; delete = requireSuperAdmin().
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';
import { SPEAKER_TYPES, SPEAKER_STATUSES } from '@/lib/speakers/constants';
import { VISITOR_LANGUAGES } from '@/lib/visitors/constants';

type SpeakerUpdate = Database['public']['Tables']['speakers']['Update'];

const UpdateSchema = z.object({
  speaker_type: z.enum(SPEAKER_TYPES).nullable().optional(),
  status: z.enum(SPEAKER_STATUSES).optional(),
  language: z.enum(VISITOR_LANGUAGES).optional(),
  bio_short: z.string().trim().max(500).nullable().optional(),
  bio_long: z.string().trim().max(8000).nullable().optional(),
  topics: z.array(z.string().trim().max(80)).max(20).nullable().optional(),
  photo_url: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
  linkedin_url: z.string().trim().url().max(300).nullable().optional().or(z.literal('')),
  twitter_handle: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
});

export type UpdateSpeakerInput = z.input<typeof UpdateSchema>;

const UUID = /^[0-9a-f-]{36}$/i;

export async function updateSpeakerAction(
  speakerId: string,
  input: UpdateSpeakerInput,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  if (!UUID.test(speakerId)) throw new Error('ID speaker invalide.');
  const patch = UpdateSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  // Normalise les chaînes vides en null (URLs optionnelles).
  const clean: SpeakerUpdate = { ...patch, updated_at: new Date().toISOString() };
  if (clean.photo_url === '') clean.photo_url = null;
  if (clean.linkedin_url === '') clean.linkedin_url = null;
  // confirmed_at suit le statut.
  if (patch.status === 'confirmed') clean.confirmed_at = new Date().toISOString();

  const { error } = await supabase.from('speakers').update(clean).eq('id', speakerId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'speakers',
    entity_id: speakerId,
    before: null,
    after: { kind: 'speaker_updated' },
  });

  revalidatePath('/admin/speakers');
  revalidatePath(`/admin/speakers/${speakerId}`);
  return { success: true };
}

async function setStatus(
  speakerId: string,
  status: 'confirmed' | 'declined',
  kind: string,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  if (!UUID.test(speakerId)) throw new Error('ID speaker invalide.');
  const supabase = getSupabaseServiceClient();

  await supabase
    .from('speakers')
    .update({
      status,
      confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', speakerId);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'speakers',
    entity_id: speakerId,
    before: null,
    after: { kind, status },
  });

  revalidatePath('/admin/speakers');
  revalidatePath(`/admin/speakers/${speakerId}`);
  return { success: true };
}

export async function confirmSpeakerAction(speakerId: string) {
  return setStatus(speakerId, 'confirmed', 'speaker_confirmed');
}

export async function declineSpeakerAction(speakerId: string) {
  return setStatus(speakerId, 'declined', 'speaker_declined');
}

export async function deleteSpeakerAction(speakerId: string): Promise<{ success: true }> {
  const admin = await requireSuperAdmin();
  if (!UUID.test(speakerId)) throw new Error('ID speaker invalide.');
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.from('speakers').delete().eq('id', speakerId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'delete',
    entity_type: 'speakers',
    entity_id: speakerId,
    before: null,
    after: { kind: 'speaker_deleted' },
  });

  revalidatePath('/admin/speakers');
  return { success: true };
}
