'use server';

/**
 * P16.1 — lecture des speakers (liste + fiche + stats).
 * Service-role + garde requireAdminProfile() (table speakers = RLS service_role).
 */

import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { SpeakerListItem } from '@/lib/speakers/constants';

const LIST_SELECT = `
  id, speaker_type, status, topics, language, photo_url, confirmed_at, created_at,
  contact:contacts!speakers_contact_id_fkey(id, first_name, last_name, email, phone_mobile),
  company:companies(id, name),
  owner:users!speakers_owner_user_id_fkey(id, full_name),
  conference_speakers(count)
` as const;

export type ListSpeakersInput = {
  query?: string;
  status?: string | null;
  speakerType?: string | null;
  language?: string | null;
  page?: number;
  perPage?: number;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listSpeakersAction(
  input: ListSpeakersInput = {},
): Promise<{ rows: SpeakerListItem[]; total: number; page: number; perPage: number }> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(200, Math.max(1, input.perPage ?? 50));

  // Recherche texte : résout d'abord les contact_ids.
  let contactIdFilter: string[] | null = null;
  const q = input.query?.trim() ?? '';
  if (q.length >= 2) {
    const pattern = `%${q}%`;
    const { data: matched } = await supabase
      .from('contacts')
      .select('id')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(500);
    contactIdFilter = (matched ?? []).map((c) => c.id);
    if (contactIdFilter.length === 0) return { rows: [], total: 0, page, perPage };
  }

  let query = supabase
    .from('speakers')
    .select(LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (input.status) query = query.eq('status', input.status);
  if (input.speakerType) query = query.eq('speaker_type', input.speakerType);
  if (input.language) query = query.eq('language', input.language);
  if (contactIdFilter) query = query.in('contact_id', contactIdFilter);

  query = query.range((page - 1) * perPage, page * perPage - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`listSpeakersAction: ${error.message}`);

  const rows: SpeakerListItem[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const cs = row.conference_speakers as { count: number }[] | undefined;
    return {
      id: row.id as string,
      speaker_type: (row.speaker_type as string | null) ?? null,
      status: row.status as string,
      topics: (row.topics as string[] | null) ?? null,
      language: row.language as string,
      photo_url: (row.photo_url as string | null) ?? null,
      confirmed_at: (row.confirmed_at as string | null) ?? null,
      created_at: row.created_at as string,
      contact: one(row.contact as SpeakerListItem['contact']),
      company: one(row.company as SpeakerListItem['company']),
      owner: one(row.owner as SpeakerListItem['owner']),
      conference_count: cs?.[0]?.count ?? 0,
    };
  });

  return { rows, total: count ?? 0, page, perPage };
}

export async function getSpeakerStatsAction(): Promise<{
  total: number;
  confirmed: number;
  proposed: number;
  contacted: number;
}> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const head = () => supabase.from('speakers').select('id', { count: 'exact', head: true });
  const [{ count: total }, { count: confirmed }, { count: proposed }, { count: contacted }] =
    await Promise.all([
      head(),
      head().eq('status', 'confirmed'),
      head().eq('status', 'proposed'),
      head().eq('status', 'contacted'),
    ]);
  return {
    total: total ?? 0,
    confirmed: confirmed ?? 0,
    proposed: proposed ?? 0,
    contacted: contacted ?? 0,
  };
}

export type SpeakerOption = { id: string; name: string; email: string };

/** P16.3 — recherche speakers pour le picker conférence (par nom/email). */
export async function searchSpeakerOptionsAction(query: string): Promise<SpeakerOption[]> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('speakers')
    .select('id, contact:contacts!speakers_contact_id_fkey(first_name, last_name, email)')
    .limit(200);
  const q = query.trim().toLowerCase();
  const opts: SpeakerOption[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const contact = one(
      row.contact as {
        first_name?: string | null;
        last_name?: string | null;
        email?: string;
      } | null,
    );
    const name =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() ||
      contact?.email ||
      '—';
    return { id: row.id as string, name, email: contact?.email ?? '' };
  });
  if (!q) return opts.slice(0, 20);
  return opts
    .filter((o) => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q))
    .slice(0, 20);
}

export async function getSpeakerByIdAction(speakerId: string) {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('speakers')
    .select(
      `
      *,
      contact:contacts!speakers_contact_id_fkey(*),
      company:companies(id, name, website, city),
      owner:users!speakers_owner_user_id_fkey(id, full_name, email),
      conference_speakers(
        role, speaking_order,
        conference:conferences(id, title_fr, title_en, start_at, room, city, conference_type, is_published)
      )
    `,
    )
    .eq('id', speakerId)
    .maybeSingle();

  if (error) throw new Error(`getSpeakerByIdAction: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    ...row,
    contact: one(row.contact),
    company: one(row.company),
    owner: one(row.owner),
  };
}
