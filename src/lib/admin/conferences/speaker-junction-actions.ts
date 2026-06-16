'use server';

/**
 * P16.3 — jonction conference_speakers : attacher / détacher / réordonner.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { CONFERENCE_SPEAKER_ROLES } from '@/lib/conferences/constants';

const AttachSchema = z.object({
  conference_id: z.string().uuid(),
  speaker_id: z.string().uuid(),
  role: z.enum(CONFERENCE_SPEAKER_ROLES).optional().nullable(),
  speaking_order: z.number().int().min(0).max(999).optional(),
});

export async function attachSpeakerToConferenceAction(
  input: z.infer<typeof AttachSchema>,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  const parsed = AttachSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('conference_speakers')
    .select('speaker_id')
    .eq('conference_id', parsed.conference_id)
    .eq('speaker_id', parsed.speaker_id)
    .maybeSingle();
  if (existing) throw new Error('Ce speaker est déjà rattaché à cette conférence.');

  // speaking_order par défaut = nb de speakers déjà présents.
  let order = parsed.speaking_order;
  if (order == null) {
    const { count } = await supabase
      .from('conference_speakers')
      .select('speaker_id', { count: 'exact', head: true })
      .eq('conference_id', parsed.conference_id);
    order = count ?? 0;
  }

  const { error } = await supabase.from('conference_speakers').insert({
    conference_id: parsed.conference_id,
    speaker_id: parsed.speaker_id,
    role: parsed.role ?? null,
    speaking_order: order,
  });
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'conferences',
    entity_id: parsed.conference_id,
    before: null,
    after: {
      kind: 'conference_speaker_attached',
      speaker_id: parsed.speaker_id,
      role: parsed.role ?? null,
    },
  });

  revalidatePath(`/admin/conferences/${parsed.conference_id}`);
  return { success: true };
}

export async function detachSpeakerFromConferenceAction(input: {
  conference_id: string;
  speaker_id: string;
}): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  const conferenceId = input.conference_id;
  const speakerId = input.speaker_id;
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from('conference_speakers')
    .delete()
    .eq('conference_id', conferenceId)
    .eq('speaker_id', speakerId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'conferences',
    entity_id: conferenceId,
    before: null,
    after: { kind: 'conference_speaker_detached', speaker_id: speakerId },
  });

  revalidatePath(`/admin/conferences/${conferenceId}`);
  return { success: true };
}

export async function reorderConferenceSpeakersAction(input: {
  conference_id: string;
  ordered_speaker_ids: string[];
}): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  const conferenceId = input.conference_id;
  const supabase = getSupabaseServiceClient();

  // speaking_order = index dans le tableau ordonné.
  await Promise.all(
    input.ordered_speaker_ids.map((speakerId, idx) =>
      supabase
        .from('conference_speakers')
        .update({ speaking_order: idx })
        .eq('conference_id', conferenceId)
        .eq('speaker_id', speakerId),
    ),
  );

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'conferences',
    entity_id: conferenceId,
    before: null,
    after: { kind: 'conference_speakers_reordered' },
  });

  revalidatePath(`/admin/conferences/${conferenceId}`);
  return { success: true };
}
