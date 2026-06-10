'use server';

/**
 * P11.x.PartnerPasswordOptional — server actions auth password partenaire.
 *
 * loginPartnerWithPasswordAction  : email + password → session cookie 30j
 * setPartnerPasswordAction        : set/change password (connecté)
 * removePartnerPasswordAction     : supprimer son propre password (connecté)
 *
 * Anti-enumeration : messages génériques pour login / lookup échecs.
 * Audit log : kind partner_password_set / partner_password_removed.
 */

import { z } from 'zod';
import { cookies } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  signLongContactSessionToken,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  ESPACE_EXPOSANT_SESSION_LONG_MAX_AGE,
} from '@/lib/espace-partenaire/jwt';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { hashPassword, verifyPassword, validatePasswordStrength } from './partner-password';

// ─── Login ──────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
});

export type LoginWithPasswordResult = { ok: true } | { ok: false; error: string };

export async function loginPartnerWithPasswordAction(
  input: z.infer<typeof loginSchema>,
): Promise<LoginWithPasswordResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email, password_hash')
    .ilike('email', parsed.data.email)
    .limit(1)
    .maybeSingle();

  // Réponse générique — anti-enumeration : même délai si compte inexistant
  if (!contact || !contact.password_hash) {
    // Dummy compare pour timing constant
    await verifyPassword('dummy', '$2a$12$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    return { ok: false, error: 'invalid_credentials' };
  }

  const valid = await verifyPassword(parsed.data.password, contact.password_hash);
  if (!valid) {
    return { ok: false, error: 'invalid_credentials' };
  }

  // Générer session longue durée (30 j) + poser cookie
  const token = await signLongContactSessionToken(contact.id);
  const cookieStore = await cookies();
  cookieStore.set(ESPACE_EXPOSANT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ESPACE_EXPOSANT_SESSION_LONG_MAX_AGE,
    path: '/',
  });

  // Audit (best-effort, non bloquant)
  try {
    await supabase.from('audit_log').insert({
      action: 'partner_password_login',
      entity_type: 'contacts',
      entity_id: contact.id,
      user_id: null,
      before: null,
      after: { contact_id: contact.id, method: 'password' },
    });
  } catch {
    // Non bloquant
  }

  return { ok: true };
}

// ─── Set / change password ───────────────────────────────────────────

const setSchema = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8).max(200),
});

export type SetPasswordResult = { ok: true } | { ok: false; error: string };

export async function setPartnerPasswordAction(
  locale: 'fr' | 'en',
  input: z.infer<typeof setSchema>,
): Promise<SetPasswordResult> {
  let session: { contactId: string };
  try {
    session = await requireContactSession(locale);
  } catch {
    return { ok: false, error: 'not_authenticated' };
  }

  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const validationError = validatePasswordStrength(parsed.data.new_password);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabaseServiceClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('password_hash')
    .eq('id', session.contactId)
    .maybeSingle();

  // Si déjà un mot de passe → vérifier l'ancien
  if (contact?.password_hash) {
    if (!parsed.data.current_password) {
      return { ok: false, error: 'current_password_required' };
    }
    const valid = await verifyPassword(parsed.data.current_password, contact.password_hash);
    if (!valid) {
      return { ok: false, error: 'current_password_incorrect' };
    }
  }

  const newHash = await hashPassword(parsed.data.new_password);

  await supabase
    .from('contacts')
    .update({ password_hash: newHash, password_set_at: new Date().toISOString() })
    .eq('id', session.contactId);

  await supabase.from('audit_log').insert({
    action: 'partner_password_set',
    entity_type: 'contacts',
    entity_id: session.contactId,
    user_id: null,
    before: null,
    after: { contact_id: session.contactId, triggered_by: 'self' },
  });

  return { ok: true };
}

// ─── Remove password ─────────────────────────────────────────────────

export type RemovePasswordResult = { ok: true } | { ok: false; error: string };

export async function removePartnerPasswordAction(
  locale: 'fr' | 'en',
): Promise<RemovePasswordResult> {
  let session: { contactId: string };
  try {
    session = await requireContactSession(locale);
  } catch {
    return { ok: false, error: 'not_authenticated' };
  }

  const supabase = getSupabaseServiceClient();

  await supabase
    .from('contacts')
    .update({ password_hash: null, password_set_at: null })
    .eq('id', session.contactId);

  await supabase.from('audit_log').insert({
    action: 'partner_password_removed',
    entity_type: 'contacts',
    entity_id: session.contactId,
    user_id: null,
    before: null,
    after: { contact_id: session.contactId, triggered_by: 'self' },
  });

  return { ok: true };
}
