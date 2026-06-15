'use server';

/**
 * P15.2 — conversions croisées 3-way (prospect ↔ visiteur ↔ speaker).
 *
 * Règle d'or : chaque conversion ADD une row, JAMAIS DELETE. L'historique est
 * préservé (un contact peut être prospect ET visiteur ET speaker).
 *
 * Service-role + garde requireAdminProfile() + audit_log sur l'entité SOURCE.
 */

import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { createVisitorAction } from '@/lib/admin/visitors/create-actions';
import { createSpeakerAction } from '@/lib/admin/speakers/create-actions';
import { insertProspectFromContact } from '@/lib/admin/prospects/create-core';
import type { PoleCode } from '@/lib/design-tokens';
import type { VisitorLanguage } from '@/lib/visitors/constants';

function mapLang(lang: string | null | undefined): VisitorLanguage {
  return lang === 'EN' ? 'en' : 'fr';
}

/** Code pôle de la société (depuis la table poles), ou null. */
async function companyPoleCode(companyId: string | null): Promise<PoleCode | null> {
  if (!companyId) return null;
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('companies')
    .select('pole:poles(code)')
    .eq('id', companyId)
    .maybeSingle();
  const pole = data?.pole as { code?: string } | { code?: string }[] | null | undefined;
  const code = Array.isArray(pole) ? pole[0]?.code : pole?.code;
  return (code as PoleCode | undefined) ?? null;
}

async function contactLanguage(contactId: string): Promise<VisitorLanguage> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('contacts')
    .select('language')
    .eq('id', contactId)
    .maybeSingle();
  return mapLang(data?.language);
}

async function auditConversion(
  entityType: string,
  entityId: string,
  kind: string,
  payload: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase.from('audit_log').insert({
    user_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action: 'create',
    after: { kind, ...payload },
  });
}

// ─── PROSPECT → VISITEUR ─────────────────────────────────────────────────────
export async function convertProspectToVisitorAction(input: {
  prospect_id: string;
}): Promise<{ success: true; visitor_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, primary_contact_id, company_id')
    .eq('id', input.prospect_id)
    .maybeSingle();
  if (!prospect?.primary_contact_id)
    throw new Error('Prospect (ou contact principal) introuvable.');

  const result = await createVisitorAction({
    contact_id: prospect.primary_contact_id,
    pole: await companyPoleCode(prospect.company_id),
    language: await contactLanguage(prospect.primary_contact_id),
    source: 'converted_from_prospect',
  });

  await supabase
    .from('visitors')
    .update({ former_prospect_id: input.prospect_id, updated_at: new Date().toISOString() })
    .eq('id', result.visitor_id);

  await auditConversion(
    'prospects',
    input.prospect_id,
    'prospect_converted_to_visitor',
    { visitor_id: result.visitor_id },
    admin.id,
  );

  revalidatePath(`/admin/prospects/${input.prospect_id}`);
  revalidatePath('/admin/visitors');
  return { success: true, visitor_id: result.visitor_id };
}

// ─── PROSPECT → SPEAKER ──────────────────────────────────────────────────────
export async function convertProspectToSpeakerAction(input: {
  prospect_id: string;
}): Promise<{ success: true; speaker_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, primary_contact_id')
    .eq('id', input.prospect_id)
    .maybeSingle();
  if (!prospect?.primary_contact_id)
    throw new Error('Prospect (ou contact principal) introuvable.');

  const result = await createSpeakerAction({ contact_id: prospect.primary_contact_id });

  await auditConversion(
    'prospects',
    input.prospect_id,
    'prospect_converted_to_speaker',
    { speaker_id: result.speaker_id },
    admin.id,
  );

  revalidatePath(`/admin/prospects/${input.prospect_id}`);
  return { success: true, speaker_id: result.speaker_id };
}

// ─── VISITEUR → PROSPECT ─────────────────────────────────────────────────────
export async function convertVisitorToProspectAction(input: {
  visitor_id: string;
}): Promise<{ success: true; prospect_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: visitor } = await supabase
    .from('visitors')
    .select('id, contact_id, company_id')
    .eq('id', input.visitor_id)
    .maybeSingle();
  if (!visitor) throw new Error('Visiteur introuvable.');

  // prospects.company_id est NOT NULL → fallback sur la société du contact.
  let companyId = visitor.company_id;
  if (!companyId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', visitor.contact_id)
      .maybeSingle();
    companyId = contact?.company_id ?? null;
  }
  if (!companyId) throw new Error('Aucune société rattachée : impossible de créer le prospect.');

  const result = await insertProspectFromContact({
    contactId: visitor.contact_id,
    companyId,
    ownerId: admin.id,
  });

  await auditConversion(
    'visitors',
    input.visitor_id,
    'visitor_converted_to_prospect',
    { prospect_id: result.prospect_id },
    admin.id,
  );

  revalidatePath(`/admin/visitors/${input.visitor_id}`);
  revalidatePath('/admin/prospects');
  return { success: true, prospect_id: result.prospect_id };
}

// ─── VISITEUR → SPEAKER ──────────────────────────────────────────────────────
export async function convertVisitorToSpeakerAction(input: {
  visitor_id: string;
}): Promise<{ success: true; speaker_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: visitor } = await supabase
    .from('visitors')
    .select('id, contact_id')
    .eq('id', input.visitor_id)
    .maybeSingle();
  if (!visitor) throw new Error('Visiteur introuvable.');

  const result = await createSpeakerAction({ contact_id: visitor.contact_id });

  await auditConversion(
    'visitors',
    input.visitor_id,
    'visitor_converted_to_speaker',
    { speaker_id: result.speaker_id },
    admin.id,
  );

  revalidatePath(`/admin/visitors/${input.visitor_id}`);
  return { success: true, speaker_id: result.speaker_id };
}

// ─── SPEAKER → PROSPECT ──────────────────────────────────────────────────────
export async function convertSpeakerToProspectAction(input: {
  speaker_id: string;
}): Promise<{ success: true; prospect_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: speaker } = await supabase
    .from('speakers')
    .select('id, contact_id, company_id')
    .eq('id', input.speaker_id)
    .maybeSingle();
  if (!speaker) throw new Error('Speaker introuvable.');

  let companyId = speaker.company_id;
  if (!companyId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', speaker.contact_id)
      .maybeSingle();
    companyId = contact?.company_id ?? null;
  }
  if (!companyId) throw new Error('Aucune société rattachée : impossible de créer le prospect.');

  const result = await insertProspectFromContact({
    contactId: speaker.contact_id,
    companyId,
    ownerId: admin.id,
  });

  await auditConversion(
    'speakers',
    input.speaker_id,
    'speaker_converted_to_prospect',
    { prospect_id: result.prospect_id },
    admin.id,
  );

  revalidatePath('/admin/prospects');
  return { success: true, prospect_id: result.prospect_id };
}

// ─── SPEAKER → VISITEUR ──────────────────────────────────────────────────────
export async function convertSpeakerToVisitorAction(input: {
  speaker_id: string;
}): Promise<{ success: true; visitor_id: string }> {
  const admin = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: speaker } = await supabase
    .from('speakers')
    .select('id, contact_id, company_id')
    .eq('id', input.speaker_id)
    .maybeSingle();
  if (!speaker) throw new Error('Speaker introuvable.');

  const result = await createVisitorAction({
    contact_id: speaker.contact_id,
    pole: await companyPoleCode(speaker.company_id),
    language: await contactLanguage(speaker.contact_id),
    source: 'manual_admin',
  });

  await auditConversion(
    'speakers',
    input.speaker_id,
    'speaker_converted_to_visitor',
    { visitor_id: result.visitor_id },
    admin.id,
  );

  revalidatePath('/admin/visitors');
  return { success: true, visitor_id: result.visitor_id };
}
