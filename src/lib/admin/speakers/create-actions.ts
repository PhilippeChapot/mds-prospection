'use server';

/**
 * P15.2 — création d'un SPEAKER (SHELL, fiche complète en P16).
 * Service-role + garde requireAdminProfile() + audit_log.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const SPEAKER_TYPES = ['keynote', 'panel', 'masterclass', 'workshop', 'moderator'] as const;
const SPEAKER_STATUSES = ['proposed', 'contacted', 'confirmed', 'declined', 'cancelled'] as const;
const LANGUAGES = ['fr', 'en', 'es', 'de'] as const;

const CreateSpeakerSchema = z.object({
  contact_id: z.string().uuid(),
  speaker_type: z.enum(SPEAKER_TYPES).optional().nullable(),
  bio_short: z.string().trim().max(500).optional(),
  topics: z.array(z.string().trim().max(80)).max(20).optional(),
  language: z.enum(LANGUAGES).default('fr'),
  status: z.enum(SPEAKER_STATUSES).default('proposed'),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateSpeakerInput = z.input<typeof CreateSpeakerSchema>;

export async function createSpeakerAction(
  input: CreateSpeakerInput,
): Promise<{ success: true; speaker_id: string }> {
  const admin = await requireAdminProfile();
  const parsed = CreateSpeakerSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  // Garde-fou : un seul speaker par contact (FK UNIQUE).
  const { data: existing } = await supabase
    .from('speakers')
    .select('id')
    .eq('contact_id', parsed.contact_id)
    .maybeSingle();
  if (existing) throw new Error('Ce contact est déjà enregistré comme speaker.');

  // Récupérer la société du contact.
  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('id', parsed.contact_id)
    .maybeSingle();

  const { data: newSpeaker, error } = await supabase
    .from('speakers')
    .insert({
      contact_id: parsed.contact_id,
      company_id: contact?.company_id ?? null,
      speaker_type: parsed.speaker_type ?? null,
      bio_short: parsed.bio_short || null,
      topics: parsed.topics ?? null,
      language: parsed.language,
      status: parsed.status,
      notes: parsed.notes || null,
      owner_user_id: admin.id,
    })
    .select('id')
    .single();

  if (error || !newSpeaker) throw new Error(error?.message ?? 'Erreur création speaker.');

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    entity_type: 'speakers',
    entity_id: newSpeaker.id,
    action: 'create',
    after: {
      kind: 'speaker_created',
      contact_id: parsed.contact_id,
      speaker_type: parsed.speaker_type ?? null,
    },
  });

  revalidatePath('/admin/visitors');
  return { success: true, speaker_id: newSpeaker.id };
}
