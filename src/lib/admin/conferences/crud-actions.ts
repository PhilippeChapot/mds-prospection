'use server';

/**
 * P16.3 — CRUD conférences + check anti-overlap + génération de slug.
 * Service-role + requireAdminProfile() ; delete = requireSuperAdmin().
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  CONFERENCE_TYPES,
  CONFERENCE_CITIES,
  type ConferenceListItem,
} from '@/lib/conferences/constants';
import { POLE_CODES } from '@/lib/design-tokens';
import { generateSlug } from './slug';

const UUID = /^[0-9a-f-]{36}$/i;

const ConferenceSchema = z.object({
  title_fr: z.string().trim().min(1).max(200),
  title_en: z.string().trim().max(200).optional(),
  description_fr: z.string().trim().max(4000).optional(),
  description_en: z.string().trim().max(4000).optional(),
  conference_type: z.enum(CONFERENCE_TYPES).optional().nullable(),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
  room: z.string().trim().max(80).optional().nullable(),
  city: z.enum(CONFERENCE_CITIES).optional().nullable(),
  capacity: z.number().int().min(1).max(100000).optional().nullable(),
  poles: z.array(z.enum(POLE_CODES)).optional().nullable(),
  is_published: z.boolean().default(false),
  featured: z.boolean().default(false),
  // P16.x.PreProgrammeTeaser — public cible (affiché dans le pré-programme).
  target_audience_fr: z.string().trim().max(2000).optional().nullable(),
  target_audience_en: z.string().trim().max(2000).optional().nullable(),
  // P16.x.ConferencesKeyFigures — chiffres clés FR + EN (max 5, 200 chars).
  key_figures_fr: z.array(z.string().trim().min(1).max(200)).max(5).optional().nullable(),
  key_figures_en: z.array(z.string().trim().min(1).max(200)).max(5).optional().nullable(),
});

export type ConferenceInput = z.input<typeof ConferenceSchema>;

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const root = base || 'conference';
  let candidate = root;
  let n = 1;
  // Boucle bornée : suffixe -2, -3… jusqu'à libre.
  for (let i = 0; i < 50; i += 1) {
    let q = supabase.from('conferences').select('id').eq('slug', candidate).limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

export type OverlapHit = {
  id: string;
  title_fr: string;
  start_at: string | null;
  end_at: string | null;
};

export async function checkConferenceOverlapAction(input: {
  room: string;
  start_at: string;
  end_at: string;
  exclude_id?: string;
}): Promise<OverlapHit[]> {
  await requireAdminProfile();
  if (!input.room || !input.start_at || !input.end_at) return [];
  const supabase = getSupabaseServiceClient();
  let q = supabase
    .from('conferences')
    .select('id, title_fr, start_at, end_at')
    .eq('room', input.room)
    .lte('start_at', input.end_at)
    .gte('end_at', input.start_at);
  if (input.exclude_id) q = q.neq('id', input.exclude_id);
  const { data } = await q;
  return (data ?? []) as OverlapHit[];
}

export async function createConferenceAction(
  input: ConferenceInput,
): Promise<{ success: true; conference_id: string }> {
  const admin = await requireAdminProfile();
  const parsed = ConferenceSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  // Check anti-overlap : warning console, non bloquant (V1).
  if (parsed.room && parsed.start_at && parsed.end_at) {
    const overlaps = await checkConferenceOverlapAction({
      room: parsed.room,
      start_at: parsed.start_at,
      end_at: parsed.end_at,
    });
    if (overlaps.length > 0) {
      console.warn(
        '[createConferenceAction] overlap detected:',
        overlaps.map((o) => o.id),
      );
    }
  }

  const slug = await ensureUniqueSlug(generateSlug(parsed.title_fr));

  const { data: newConf, error } = await supabase
    .from('conferences')
    // cast : target_audience_* pas encore dans les types générés (migration 0104).
    .insert({ ...parsed, slug } as never)
    .select('id')
    .single();
  if (error || !newConf) throw new Error(error?.message ?? 'Erreur création conférence.');

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'create',
    entity_type: 'conferences',
    entity_id: newConf.id,
    before: null,
    after: { kind: 'conference_created', title_fr: parsed.title_fr },
  });

  revalidatePath('/admin/conferences');
  return { success: true, conference_id: newConf.id };
}

export async function updateConferenceAction(
  conferenceId: string,
  input: ConferenceInput,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  if (!UUID.test(conferenceId)) throw new Error('ID conférence invalide.');
  const parsed = ConferenceSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from('conferences')
    .update({ ...parsed, updated_at: new Date().toISOString() } as never)
    .eq('id', conferenceId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'conferences',
    entity_id: conferenceId,
    before: null,
    after: { kind: 'conference_updated' },
  });

  revalidatePath('/admin/conferences');
  revalidatePath(`/admin/conferences/${conferenceId}`);
  return { success: true };
}

export async function publishConferenceAction(
  conferenceId: string,
  isPublished: boolean,
): Promise<{ success: true }> {
  const admin = await requireAdminProfile();
  if (!UUID.test(conferenceId)) throw new Error('ID conférence invalide.');
  const supabase = getSupabaseServiceClient();

  await supabase
    .from('conferences')
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .eq('id', conferenceId);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'conferences',
    entity_id: conferenceId,
    before: null,
    after: { kind: isPublished ? 'conference_published' : 'conference_unpublished' },
  });

  revalidatePath('/admin/conferences');
  revalidatePath(`/admin/conferences/${conferenceId}`);
  return { success: true };
}

export async function deleteConferenceAction(conferenceId: string): Promise<{ success: true }> {
  const admin = await requireSuperAdmin();
  if (!UUID.test(conferenceId)) throw new Error('ID conférence invalide.');
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.from('conferences').delete().eq('id', conferenceId);
  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'delete',
    entity_type: 'conferences',
    entity_id: conferenceId,
    before: null,
    after: { kind: 'conference_deleted' },
  });

  revalidatePath('/admin/conferences');
  return { success: true };
}

export type ListConferencesInput = {
  city?: string | null;
  conferenceType?: string | null;
  isPublished?: boolean | null;
  featured?: boolean | null;
  validation?: 'validated' | 'unvalidated' | null;
};

export async function listConferencesAction(
  input: ListConferencesInput = {},
): Promise<ConferenceListItem[]> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  let q = supabase
    .from('conferences')
    .select(
      `id, title_fr, title_en, conference_type, start_at, end_at, room, city, capacity,
       poles, is_published, featured, is_validated, imported_at, conference_speakers(count)`,
    )
    .order('start_at', { ascending: true, nullsFirst: false });

  if (input.city) q = q.eq('city', input.city);
  if (input.conferenceType) q = q.eq('conference_type', input.conferenceType);
  if (input.isPublished != null) q = q.eq('is_published', input.isPublished);
  if (input.featured != null) q = q.eq('featured', input.featured);
  if (input.validation === 'validated') q = q.eq('is_validated', true);
  if (input.validation === 'unvalidated') q = q.eq('is_validated', false);

  const { data, error } = await q;
  if (error) throw new Error(`listConferencesAction: ${error.message}`);

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const cs = row.conference_speakers as { count: number }[] | undefined;
    return {
      id: row.id as string,
      title_fr: row.title_fr as string,
      title_en: (row.title_en as string | null) ?? null,
      conference_type: (row.conference_type as string | null) ?? null,
      start_at: (row.start_at as string | null) ?? null,
      end_at: (row.end_at as string | null) ?? null,
      room: (row.room as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      capacity: (row.capacity as number | null) ?? null,
      poles: (row.poles as string[] | null) ?? null,
      is_published: Boolean(row.is_published),
      featured: Boolean(row.featured),
      is_validated: Boolean(row.is_validated),
      imported_at: (row.imported_at as string | null) ?? null,
      speaker_count: cs?.[0]?.count ?? 0,
    };
  });
}

export async function getConferenceStatsAction(): Promise<{
  total: number;
  validated: number;
  unvalidated: number;
}> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const head = () => supabase.from('conferences').select('id', { count: 'exact', head: true });
  const [{ count: total }, { count: unvalidated }] = await Promise.all([
    head(),
    head().eq('is_validated', false),
  ]);
  return {
    total: total ?? 0,
    validated: (total ?? 0) - (unvalidated ?? 0),
    unvalidated: unvalidated ?? 0,
  };
}

export async function getConferenceByIdAction(conferenceId: string) {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('conferences')
    .select(
      `*,
       conference_speakers(
         role, speaking_order,
         speaker:speakers(
           id, speaker_type, status, photo_url,
           contact:contacts!speakers_contact_id_fkey(id, first_name, last_name, email)
         )
       )`,
    )
    .eq('id', conferenceId)
    .maybeSingle();
  if (error) throw new Error(`getConferenceByIdAction: ${error.message}`);
  return data ?? null;
}
