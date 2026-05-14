'use server';

/**
 * P5.x.22 — server actions admin pour gérer les contacts d'une société.
 *
 * Actions :
 *   - addContactAction         INSERT contact + sync Brevo (création)
 *   - updateContactAction      UPDATE contact + sync Brevo (attrs)
 *   - markAsPrimaryAction      flip is_primary (un seul primary par société)
 *   - toggleLifecycleAction    flip lifecycle_emails_enabled + add/remove de la liste 247
 *   - deleteContactAction      DELETE contact + DELETE Brevo
 *
 * Toutes les actions :
 *   - exigent `requireAdminProfile` (admin ou sales — pour delete : admin only)
 *   - écrivent une ligne `audit_log` via service-role
 *   - revalidatePath sur la fiche société + /admin/contacts
 *
 * Pas de trigger Postgres sur `contacts` → on insère manuellement les audits.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';
import {
  upsertContactBrevoSingle,
  updateContactBrevoAttributes,
  setContactListMembership,
  deleteContactBrevo,
} from './brevo-single';

type Json = Database['public']['Tables']['audit_log']['Insert']['after'];

const LOG_PREFIX = '[admin/contacts]';

const emailSchema = z.string().trim().toLowerCase().min(3).max(254).email('Email invalide.');

const addSchema = z.object({
  company_id: z.string().uuid(),
  email: emailSchema,
  first_name: z.string().trim().max(120).optional().nullable(),
  last_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  language: z.enum(['FR', 'EN']).default('FR'),
  is_primary: z.boolean().default(false),
  marketing_consent: z.boolean().default(true),
  lifecycle_emails_enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  contact_id: z.string().uuid(),
  email: emailSchema.optional(),
  first_name: z.string().trim().max(120).optional().nullable(),
  last_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  language: z.enum(['FR', 'EN']).optional(),
  marketing_consent: z.boolean().optional(),
});

export type ActionResult = { ok: true; contactId?: string } | { ok: false; error: string };

async function writeAudit(
  userId: string,
  action: 'create' | 'update' | 'delete',
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    action,
    entity_type: 'contacts',
    entity_id: entityId,
    before: (before ?? null) as Json,
    after: (after ?? null) as Json,
  });
  if (error) {
    console.warn('%s audit-log-failed entity=%s msg=%s', LOG_PREFIX, entityId, error.message);
  }
}

export async function addContactAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  // Vérifier company existe
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', data.company_id)
    .maybeSingle();
  if (!company) return { ok: false, error: 'Société introuvable.' };

  // Anti-doublon email global
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, company_id')
    .ilike('email', data.email)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error:
        existing.company_id === data.company_id
          ? 'Ce contact existe déjà sur cette société.'
          : 'Cet email est déjà utilisé par un autre contact.',
    };
  }

  // Si is_primary=true demandé, on dé-primary les autres contacts de la société.
  if (data.is_primary) {
    await supabase
      .from('contacts')
      .update({ is_primary: false })
      .eq('company_id', data.company_id)
      .eq('is_primary', true);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('contacts')
    .insert({
      company_id: data.company_id,
      email: data.email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      language: data.language,
      is_primary: data.is_primary,
      marketing_consent: data.marketing_consent,
      lifecycle_emails_enabled: data.lifecycle_emails_enabled,
      email_deliverability_status: 'unknown',
    })
    .select('id')
    .maybeSingle();

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? 'Insert failed' };
  }

  await writeAudit(profile.id, 'create', inserted.id, null, {
    company_id: data.company_id,
    email: data.email,
    is_primary: data.is_primary,
  });

  // Sync Brevo (best-effort)
  try {
    const result = await upsertContactBrevoSingle({
      email: data.email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      phone: data.phone ?? null,
      language: data.language,
      company_id: data.company_id,
    });
    if (result.brevoContactId !== null) {
      await supabase
        .from('contacts')
        .update({
          brevo_contact_id: String(result.brevoContactId),
          last_synced_brevo_at: new Date().toISOString(),
        })
        .eq('id', inserted.id);
    }
    console.log(
      '%s added contact=%s kind=%s brevoId=%s',
      LOG_PREFIX,
      inserted.id,
      result.kind,
      result.brevoContactId,
    );
  } catch (err) {
    console.error('%s brevo-sync-failed contact=%s msg=%s', LOG_PREFIX, inserted.id, err);
  }

  revalidatePath(`/admin/companies/${data.company_id}`);
  revalidatePath('/admin/contacts');
  return { ok: true, contactId: inserted.id };
}

export async function updateContactAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', data.contact_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Contact introuvable.' };

  // Si email change, anti-doublon
  if (data.email && data.email !== existing.email) {
    const { data: dupe } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', data.email)
      .neq('id', data.contact_id)
      .maybeSingle();
    if (dupe) return { ok: false, error: 'Cet email est déjà utilisé.' };
  }

  const patch: {
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    role?: string | null;
    language?: 'FR' | 'EN';
    marketing_consent?: boolean;
  } = {};
  if (data.email !== undefined) patch.email = data.email;
  if (data.first_name !== undefined) patch.first_name = data.first_name;
  if (data.last_name !== undefined) patch.last_name = data.last_name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.role !== undefined) patch.role = data.role;
  if (data.language !== undefined) patch.language = data.language;
  if (data.marketing_consent !== undefined) patch.marketing_consent = data.marketing_consent;

  if (Object.keys(patch).length === 0) return { ok: true, contactId: data.contact_id };

  const { error: updateErr } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', data.contact_id);

  if (updateErr) return { ok: false, error: updateErr.message };

  await writeAudit(profile.id, 'update', data.contact_id, existing, { ...existing, ...patch });

  // Sync Brevo (attrs uniquement, ne ré-importe pas)
  try {
    const finalEmail = patch.email ?? existing.email;
    await updateContactBrevoAttributes(finalEmail, {
      first_name: patch.first_name ?? existing.first_name,
      last_name: patch.last_name ?? existing.last_name,
      phone: patch.phone ?? existing.phone,
      company_id: existing.company_id,
      language: patch.language ?? existing.language,
    });
  } catch (err) {
    console.error('%s brevo-update-failed contact=%s msg=%s', LOG_PREFIX, data.contact_id, err);
  }

  revalidatePath(`/admin/companies/${existing.company_id}`);
  revalidatePath('/admin/contacts');
  return { ok: true, contactId: data.contact_id };
}

const markPrimarySchema = z.object({ contact_id: z.string().uuid() });

export async function markAsPrimaryAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  const parsed = markPrimarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation' };
  const { contact_id } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, is_primary, email')
    .eq('id', contact_id)
    .maybeSingle();
  if (!contact) return { ok: false, error: 'Contact introuvable.' };

  if (contact.is_primary) return { ok: true, contactId: contact_id };

  // Unset les autres primary de cette société puis set ce contact en primary.
  const { error: unsetErr } = await supabase
    .from('contacts')
    .update({ is_primary: false })
    .eq('company_id', contact.company_id)
    .eq('is_primary', true);
  if (unsetErr) return { ok: false, error: unsetErr.message };

  const { error: setErr } = await supabase
    .from('contacts')
    .update({ is_primary: true })
    .eq('id', contact_id);
  if (setErr) return { ok: false, error: setErr.message };

  await writeAudit(profile.id, 'update', contact_id, { is_primary: false }, { is_primary: true });

  revalidatePath(`/admin/companies/${contact.company_id}`);
  revalidatePath('/admin/contacts');
  return { ok: true, contactId: contact_id };
}

const toggleLifecycleSchema = z.object({
  contact_id: z.string().uuid(),
  enabled: z.boolean(),
});

export async function toggleLifecycleAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  const parsed = toggleLifecycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation' };
  const { contact_id, enabled } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, brevo_contact_id, lifecycle_emails_enabled')
    .eq('id', contact_id)
    .maybeSingle();
  if (!contact) return { ok: false, error: 'Contact introuvable.' };

  if (contact.lifecycle_emails_enabled === enabled) {
    return { ok: true, contactId: contact_id };
  }

  const { error: updateErr } = await supabase
    .from('contacts')
    .update({ lifecycle_emails_enabled: enabled })
    .eq('id', contact_id);
  if (updateErr) return { ok: false, error: updateErr.message };

  await writeAudit(
    profile.id,
    'update',
    contact_id,
    { lifecycle_emails_enabled: !enabled },
    { lifecycle_emails_enabled: enabled },
  );

  if (contact.brevo_contact_id) {
    try {
      await setContactListMembership(Number.parseInt(contact.brevo_contact_id, 10), enabled);
    } catch (err) {
      console.error(
        '%s brevo-list-membership-failed contact=%s msg=%s',
        LOG_PREFIX,
        contact_id,
        err,
      );
    }
  }

  revalidatePath(`/admin/companies/${contact.company_id}`);
  revalidatePath('/admin/contacts');
  return { ok: true, contactId: contact_id };
}

const deleteSchema = z.object({ contact_id: z.string().uuid() });

export async function deleteContactAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Suppression réservée aux admins.' };
  }
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation' };
  const { contact_id } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contact_id)
    .maybeSingle();
  if (!contact) return { ok: false, error: 'Contact introuvable.' };

  // Bloquer si le contact est référencé par un prospect en tant que primary
  const { data: linkedProspects } = await supabase
    .from('prospects')
    .select('id')
    .eq('primary_contact_id', contact_id)
    .limit(1);
  if (linkedProspects && linkedProspects.length > 0) {
    return {
      ok: false,
      error:
        'Ce contact est primary sur au moins un prospect. Réaffectez le contact primary avant de supprimer.',
    };
  }

  const { error: deleteErr } = await supabase.from('contacts').delete().eq('id', contact_id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  await writeAudit(profile.id, 'delete', contact_id, contact, null);

  // Brevo delete (best-effort, ne bloque pas)
  try {
    await deleteContactBrevo(contact.email);
  } catch (err) {
    console.error('%s brevo-delete-failed contact=%s msg=%s', LOG_PREFIX, contact_id, err);
  }

  revalidatePath(`/admin/companies/${contact.company_id}`);
  revalidatePath('/admin/contacts');
  return { ok: true, contactId: contact_id };
}
