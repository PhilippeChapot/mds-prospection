/**
 * P16.x.ImportPrograms — helpers d'upsert (idempotents) pour l'import DOCX.
 * Le client Supabase est injecté en paramètre → testable + utilisable hors Next
 * (script). Pas de 'use server'.
 *
 * Doctrine placeholders :
 *   - personne nommée  → contact réel (email *@placeholder-imported.local).
 *   - org / générique  → contact placeholder "À identifier @ {org}".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { ParsedConference, ParsedSpeaker } from './parse-program';
import { generateSlug } from '@/lib/admin/conferences/slug';

export const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder-imported.local';
type Client = SupabaseClient<Database>;

export function slugifyEmailPart(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 60) || 'x'
  );
}

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Trouve (par name_normalized) ou crée une société. Renvoie son id. */
export async function ensureCompany(supabase: Client, name: string): Promise<string> {
  const clean = name.trim();
  const nameNormalized = normalizeName(clean);
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('name_normalized', nameNormalized)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('companies')
    .insert({ name: clean, name_normalized: nameNormalized, category: 'standard' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`ensureCompany(${clean}): ${error?.message}`);
  return created.id;
}

export type EnsuredContact = { contactId: string; email: string; isPlaceholder: boolean };

/**
 * Trouve/crée le contact correspondant à un intervenant parsé.
 *   - person → contact nominatif (email placeholder déterministe par nom+org).
 *   - org    → contact "À identifier @ {org}".
 * Idempotent par email (unique).
 */
export async function ensureContactForSpeaker(
  supabase: Client,
  sp: ParsedSpeaker,
): Promise<EnsuredContact> {
  const companyId = await ensureCompany(supabase, sp.org);

  let email: string;
  let firstName: string;
  let lastName: string;
  let isPlaceholder: boolean;

  if (sp.kind === 'person' && sp.firstName) {
    firstName = sp.firstName;
    lastName = sp.lastName ?? '';
    email = `${slugifyEmailPart(`${firstName}.${lastName}`)}.${slugifyEmailPart(sp.org)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    isPlaceholder = false;
  } else {
    firstName = 'À identifier';
    lastName = `@ ${sp.org}`;
    email = `placeholder.${slugifyEmailPart(sp.org)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    isPlaceholder = true;
  }

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existing) return { contactId: existing.id, email, isPlaceholder };

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({ first_name: firstName, last_name: lastName, email, company_id: companyId })
    .select('id')
    .single();
  if (error || !created) throw new Error(`ensureContactForSpeaker(${email}): ${error?.message}`);
  return { contactId: created.id, email, isPlaceholder };
}

/**
 * Trouve/crée le speaker pour un contact (idempotent par contact_id UNIQUE).
 * À l'import : status='proposed', is_validated=false, source tracée.
 */
export async function ensureSpeaker(
  supabase: Client,
  input: {
    contactId: string;
    companyId: string | null;
    programTrack: string;
    importedSource: string;
    nowIso: string;
  },
): Promise<{ speakerId: string; created: boolean }> {
  const { data: existing } = await supabase
    .from('speakers')
    .select('id')
    .eq('contact_id', input.contactId)
    .maybeSingle();
  if (existing) return { speakerId: existing.id, created: false };

  const { data: created, error } = await supabase
    .from('speakers')
    .insert({
      contact_id: input.contactId,
      company_id: input.companyId,
      status: 'proposed',
      language: 'fr',
      is_validated: false,
      program_track: input.programTrack,
      imported_at: input.nowIso,
      imported_source: input.importedSource,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`ensureSpeaker(${input.contactId}): ${error?.message}`);
  return { speakerId: created.id, created: true };
}

/** Trouve/crée la conférence (idempotent par title_fr + program_track). */
export async function ensureConference(
  supabase: Client,
  conf: ParsedConference,
  input: { programTrack: string; importedSource: string; nowIso: string },
): Promise<{ conferenceId: string; created: boolean }> {
  const { data: existing } = await supabase
    .from('conferences')
    .select('id')
    .eq('title_fr', conf.title)
    .eq('program_track', input.programTrack)
    .maybeSingle();
  if (existing) return { conferenceId: existing.id, created: false };

  const trackSuffix = input.programTrack === 'prs_radio_audio' ? 'prs' : 'mds';
  const slug = `${generateSlug(conf.title)}-${trackSuffix}`;

  const { data: created, error } = await supabase
    .from('conferences')
    .insert({
      title_fr: conf.title,
      description_fr: conf.pitch,
      conference_type: 'panel',
      poles: conf.poles.length ? conf.poles : null,
      program_track: input.programTrack,
      is_published: false,
      is_validated: false,
      slug,
      imported_at: input.nowIso,
      imported_source: input.importedSource,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`ensureConference(${conf.title}): ${error?.message}`);
  return { conferenceId: created.id, created: true };
}

/** Rattache un speaker à une conférence (idempotent). */
export async function attachImportedSpeaker(
  supabase: Client,
  conferenceId: string,
  speakerId: string,
  speakingOrder: number,
  role: string | null,
): Promise<{ attached: boolean }> {
  const { data: existing } = await supabase
    .from('conference_speakers')
    .select('speaker_id')
    .eq('conference_id', conferenceId)
    .eq('speaker_id', speakerId)
    .maybeSingle();
  if (existing) return { attached: false };

  const { error } = await supabase.from('conference_speakers').insert({
    conference_id: conferenceId,
    speaker_id: speakerId,
    speaking_order: speakingOrder,
    role: role ? role.slice(0, 80) : null,
  });
  if (error) throw new Error(`attachImportedSpeaker: ${error.message}`);
  return { attached: true };
}
