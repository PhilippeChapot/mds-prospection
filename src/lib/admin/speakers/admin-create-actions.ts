'use server';

/**
 * P16.1 — création speaker depuis la fiche admin (/admin/speakers/new).
 * Deux modes : contact existant OU nouveau contact (+ société). Étend le
 * createSpeakerAction P15.2 (qui ne gère que contact_id) avec les champs P16.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { SPEAKER_TYPES, SPEAKER_STATUSES } from '@/lib/speakers/constants';
import { VISITOR_LANGUAGES } from '@/lib/visitors/constants';

const NewContactSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone_mobile: z.string().trim().max(50).optional(),
  role: z.string().trim().max(250).optional(),
  new_company_name: z.string().trim().min(2).max(200).optional(),
});

const CreateSchema = z
  .object({
    contact_id: z.string().uuid().optional(),
    new_contact: NewContactSchema.optional(),
    speaker_type: z.enum(SPEAKER_TYPES).optional().nullable(),
    status: z.enum(SPEAKER_STATUSES).default('proposed'),
    topics: z.array(z.string().trim().max(80)).max(20).optional(),
    bio_short: z.string().trim().max(500).optional(),
    bio_long: z.string().trim().max(8000).optional(),
    photo_url: z.string().trim().url().max(500).optional().or(z.literal('')),
    linkedin_url: z.string().trim().url().max(300).optional().or(z.literal('')),
    twitter_handle: z.string().trim().max(80).optional(),
    language: z.enum(VISITOR_LANGUAGES).default('fr'),
    owner_user_id: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.contact_id) || Boolean(d.new_contact), {
    message: 'contact_id OU new_contact requis',
    path: ['contact_id'],
  });

export type CreateSpeakerFullInput = z.input<typeof CreateSchema>;

export async function createSpeakerFullAction(
  input: CreateSpeakerFullInput,
): Promise<{ success: true; speaker_id: string }> {
  const admin = await requireAdminProfile();
  const parsed = CreateSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  let contactId = parsed.contact_id ?? null;
  let companyId: string | null = null;

  if (!contactId && parsed.new_contact) {
    const nc = parsed.new_contact;
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, company_id')
      .ilike('email', nc.email)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
      companyId = existing.company_id ?? null;
    } else {
      if (nc.new_company_name) {
        const nameNormalized = nc.new_company_name.toLowerCase();
        const { data: existingCo } = await supabase
          .from('companies')
          .select('id')
          .eq('name_normalized', nameNormalized)
          .maybeSingle();
        if (existingCo) companyId = existingCo.id;
        else {
          const { data: newCo, error: coErr } = await supabase
            .from('companies')
            .insert({
              name: nc.new_company_name,
              name_normalized: nameNormalized,
              category: 'standard',
            })
            .select('id')
            .single();
          if (coErr || !newCo) throw new Error(coErr?.message ?? 'Erreur création société.');
          companyId = newCo.id;
        }
      }
      if (!companyId) throw new Error('Une société (existante ou nouvelle) est requise.');
      const { data: newContact, error: ctErr } = await supabase
        .from('contacts')
        .insert({
          first_name: nc.first_name,
          last_name: nc.last_name,
          email: nc.email,
          phone_mobile: nc.phone_mobile || null,
          role: nc.role || null,
          company_id: companyId,
        })
        .select('id')
        .single();
      if (ctErr || !newContact) throw new Error(ctErr?.message ?? 'Erreur création contact.');
      contactId = newContact.id;
    }
  }

  if (!contactId) throw new Error('Contact introuvable.');

  const { data: existingSpeaker } = await supabase
    .from('speakers')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (existingSpeaker) throw new Error('Ce contact est déjà enregistré comme speaker.');

  if (!companyId) {
    const { data: c } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', contactId)
      .maybeSingle();
    companyId = c?.company_id ?? null;
  }

  const { data: newSpeaker, error } = await supabase
    .from('speakers')
    .insert({
      contact_id: contactId,
      company_id: companyId,
      speaker_type: parsed.speaker_type ?? null,
      status: parsed.status,
      topics: parsed.topics ?? null,
      bio_short: parsed.bio_short || null,
      bio_long: parsed.bio_long || null,
      photo_url: parsed.photo_url || null,
      linkedin_url: parsed.linkedin_url || null,
      twitter_handle: parsed.twitter_handle || null,
      language: parsed.language,
      owner_user_id: parsed.owner_user_id ?? admin.id,
      confirmed_at: parsed.status === 'confirmed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error || !newSpeaker) throw new Error(error?.message ?? 'Erreur création speaker.');

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'create',
    entity_type: 'speakers',
    entity_id: newSpeaker.id,
    before: null,
    after: { kind: 'speaker_created', contact_id: contactId, source: 'admin_form' },
  });

  revalidatePath('/admin/speakers');
  return { success: true, speaker_id: newSpeaker.id };
}
