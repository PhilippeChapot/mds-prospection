'use server';

/**
 * P8.1 — server actions preferences communication contact.
 *
 * Actions admin :
 *   - listContactPreferencesByCompanyAction (admin/sales)
 *   - upsertContactPreferenceAdminAction    (admin/sales)
 *   - unlockAllPreferencesAction            (super_admin)
 *
 * Actions partagees admin / contact self :
 *   - unsubscribeAllAction
 *   - resubscribeAction
 *
 * Actions contact self (via espace-partenaire JWT cookie) :
 *   - getMyPreferencesAction
 *   - updateMyPreferencesAction
 *
 * Distinction admin/self au niveau DB : `updated_by_user_id`.
 *   - admin    : set explicitement = profile.id => trigger lock bypass OK.
 *   - self     : laisse null => trigger lock enforcement REVERT les
 *                modifs sur prefs locked.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { LOCK_KEYS, PREF_KEYS, type ContactPreferencesRow } from './types';

const LOG_PREFIX = '[contact-preferences]';

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const prefsZodShape = {
  pref_general: z.boolean().optional(),
  pref_exposant: z.boolean().optional(),
  pref_facturation: z.boolean().optional(),
  pref_kit_media: z.boolean().optional(),
  pref_administration: z.boolean().optional(),
  pref_partenariat: z.boolean().optional(),
  pref_post_event: z.boolean().optional(),
};

const locksZodShape = {
  general_locked_by_admin: z.boolean().optional(),
  exposant_locked_by_admin: z.boolean().optional(),
  facturation_locked_by_admin: z.boolean().optional(),
  kit_media_locked_by_admin: z.boolean().optional(),
  administration_locked_by_admin: z.boolean().optional(),
  partenariat_locked_by_admin: z.boolean().optional(),
  post_event_locked_by_admin: z.boolean().optional(),
};

const upsertAdminSchema = z.object({
  contact_id: z.string().uuid(),
  prefs: z.object(prefsZodShape).optional(),
  locks: z.object(locksZodShape).optional(),
});

const unsubSchema = z.object({
  contact_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

const updateSelfSchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  prefs: z.object(prefsZodShape),
});

// ---------------------------------------------------------------------------
// listContactPreferencesByCompanyAction
// ---------------------------------------------------------------------------

export interface ContactWithPreferences {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_primary: boolean;
  preferences: ContactPreferencesRow | null;
}

export async function listContactPreferencesByCompanyAction(input: {
  company_id: string;
}): Promise<ContactWithPreferences[]> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('contacts')
    .select(
      `id, email, first_name, last_name, is_primary, created_at,
       preferences:contact_preferences(*)`,
    )
    .eq('company_id', input.company_id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('%s list-failed msg=%s', LOG_PREFIX, error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    const prefs = Array.isArray(r.preferences) ? r.preferences[0] : r.preferences;
    return {
      contact_id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      is_primary: r.is_primary,
      preferences: (prefs as ContactPreferencesRow | null) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// upsertContactPreferenceAdminAction (admin/sales)
// ---------------------------------------------------------------------------

export async function upsertContactPreferenceAdminAction(
  input: z.input<typeof upsertAdminSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  const parsed = upsertAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const { contact_id, prefs = {}, locks = {} } = parsed.data;

  const supabase = getSupabaseServiceClient();

  // Charger l'etat avant pour audit before/after.
  const { data: before } = await supabase
    .from('contact_preferences')
    .select('*')
    .eq('contact_id', contact_id)
    .maybeSingle();

  // Construire le patch (only-defined fields).
  const patch: Record<string, unknown> = {
    ...prefs,
    ...locks,
    updated_by_user_id: profile.id, // gate-keeping : signal "admin context".
    updated_at: new Date().toISOString(),
  };

  if (before) {
    const { error } = await supabase
      .from('contact_preferences')
      .update(patch as never)
      .eq('contact_id', contact_id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Pas de row existante (legacy contact sans backfill) -> insert.
    const { error } = await supabase
      .from('contact_preferences')
      .insert({ contact_id, ...patch } as never);
    if (error) return { ok: false, error: error.message };
  }

  // Audit log.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'contact_preferences',
      entity_id: contact_id,
      action: 'update',
      before: (before ?? {}) as never,
      after: {
        kind: 'admin_updated',
        actor_role: profile.role,
        patch,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed contact=%s msg=%s',
      LOG_PREFIX,
      contact_id,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/companies/[id]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// unlockAllPreferencesAction (super_admin only)
// ---------------------------------------------------------------------------

export async function unlockAllPreferencesAction(input: {
  contact_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let profile;
  try {
    profile = await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reserve super_admin.' };
  }

  const supabase = getSupabaseServiceClient();
  const reset: Record<string, unknown> = { updated_by_user_id: profile.id };
  for (const k of LOCK_KEYS) reset[k] = false;

  const { error } = await supabase
    .from('contact_preferences')
    .update(reset as never)
    .eq('contact_id', input.contact_id);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'contact_preferences',
      entity_id: input.contact_id,
      action: 'update',
      after: { kind: 'unlock_all', actor_role: 'super_admin' } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed contact=%s msg=%s',
      LOG_PREFIX,
      input.contact_id,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/companies/[id]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// unsubscribeAllAction (admin OR contact self)
// ---------------------------------------------------------------------------

export async function unsubscribeAllAction(
  input: z.input<typeof unsubSchema> & { as_contact?: boolean; locale?: 'fr' | 'en' },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = unsubSchema.safeParse({
    contact_id: input.contact_id,
    reason: input.reason,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }

  let actorUserId: string | null = null;
  let actorRole: 'admin' | 'sales' | 'super_admin' | 'contact' = 'contact';

  if (input.as_contact) {
    // Verifier que le contact connecte est bien le owner.
    try {
      const ok = await assertContactOwnsRow(input.locale ?? 'fr', input.contact_id);
      if (!ok) return { ok: false, error: 'Accès refusé.' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
    }
  } else {
    const profile = await requireAdminProfile();
    actorUserId = profile.id;
    actorRole = profile.role as typeof actorRole;
  }

  const supabase = getSupabaseServiceClient();
  const patch: Record<string, unknown> = {
    pref_general: false,
    pref_exposant: false,
    pref_facturation: false,
    pref_kit_media: false,
    pref_administration: false,
    pref_partenariat: false,
    pref_post_event: false,
    unsubscribed_all_at: new Date().toISOString(),
    unsubscribed_reason: parsed.data.reason ?? null,
    updated_by_user_id: actorUserId, // null si contact self
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('contact_preferences')
    .update(patch as never)
    .eq('contact_id', parsed.data.contact_id);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: actorUserId,
      entity_type: 'contact_preferences',
      entity_id: parsed.data.contact_id,
      action: 'update',
      after: {
        kind: 'unsubscribed_all',
        actor_role: actorRole,
        reason: parsed.data.reason ?? null,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed contact=%s msg=%s',
      LOG_PREFIX,
      parsed.data.contact_id,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/companies/[id]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// resubscribeAction
// ---------------------------------------------------------------------------

export async function resubscribeAction(input: {
  contact_id: string;
  as_contact?: boolean;
  locale?: 'fr' | 'en';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let actorUserId: string | null = null;
  let actorRole: string = 'contact';

  if (input.as_contact) {
    try {
      const ok = await assertContactOwnsRow(input.locale ?? 'fr', input.contact_id);
      if (!ok) return { ok: false, error: 'Accès refusé.' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
    }
  } else {
    const profile = await requireAdminProfile();
    actorUserId = profile.id;
    actorRole = profile.role;
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('contact_preferences')
    .update({
      unsubscribed_all_at: null,
      unsubscribed_reason: null,
      updated_by_user_id: actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('contact_id', input.contact_id);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: actorUserId,
      entity_type: 'contact_preferences',
      entity_id: input.contact_id,
      action: 'update',
      after: { kind: 'resubscribed', actor_role: actorRole } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed contact=%s msg=%s',
      LOG_PREFIX,
      input.contact_id,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/companies/[id]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// getMyPreferencesAction (contact self)
// ---------------------------------------------------------------------------

export async function getMyPreferencesAction(input?: {
  locale?: 'fr' | 'en';
}): Promise<ContactPreferencesRow | null> {
  let contactId: string;
  try {
    contactId = await resolveContactIdFromSession(input?.locale ?? 'fr');
  } catch {
    return null;
  }
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('contact_preferences')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle();
  return (data as ContactPreferencesRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// updateMyPreferencesAction (contact self)
// ---------------------------------------------------------------------------

export async function updateMyPreferencesAction(
  input: z.input<typeof updateSelfSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateSelfSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  let contactId: string;
  try {
    contactId = await resolveContactIdFromSession(parsed.data.locale);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
  }
  const supabase = getSupabaseServiceClient();

  // self : on filtre les prefs (Zod) ET on laisse updated_by_user_id=null
  // pour que le trigger applique l'enforcement des locks.
  const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of PREF_KEYS) {
    if (parsed.data.prefs[k] !== undefined) cleanPatch[k] = parsed.data.prefs[k];
  }

  const { error } = await supabase
    .from('contact_preferences')
    .update(cleanPatch as never)
    .eq('contact_id', contactId);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: null,
      entity_type: 'contact_preferences',
      entity_id: contactId,
      action: 'update',
      after: { kind: 'self_updated', actor_role: 'contact', patch: cleanPatch } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed contact=%s msg=%s',
      LOG_PREFIX,
      contactId,
      err instanceof Error ? err.message : String(err),
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers internes (async pour respecter 'use server')
// ---------------------------------------------------------------------------

async function resolveContactIdFromSession(locale: string): Promise<string> {
  // P8.2-redirect-loop : on utilise requireContactSession (qui marche pour
  // tout contact, partenaire ou simple) au lieu de requireEspacePartenaireSession
  // qui aurait redirige vers /dashboard pour un contact simple sans prospect.
  const session = await requireContactSession(locale);
  if (!session.contactId) {
    throw new Error('Contact introuvable pour cette session.');
  }
  return session.contactId;
}

async function assertContactOwnsRow(locale: string, contactId: string): Promise<boolean> {
  const sessionContactId = await resolveContactIdFromSession(locale);
  return sessionContactId === contactId;
}
