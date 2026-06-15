'use server';

/**
 * P15.3 — server actions auth password VISITEUR (visitor_accounts).
 * Cloné de partner-password-actions.ts. Audit : action enum + after.kind.
 */

import { z } from 'zod';
import { cookies } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  signLongVisitorSessionToken,
  ESPACE_VISITEUR_SESSION_COOKIE,
  ESPACE_VISITEUR_SESSION_LONG_MAX_AGE,
} from '@/lib/espace-visiteur/jwt';
import { requireVisitorSession } from '@/lib/espace-visiteur/session';
import { getVisitorAccountByEmail } from '@/lib/espace-visiteur/accounts';
import { hashPassword, verifyPassword, validatePasswordStrength } from './partner-password';

// ─── Login par mot de passe ──────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
});

export type VisitorLoginResult = { ok: true } | { ok: false; error: string };

export async function loginVisitorWithPasswordAction(
  input: z.infer<typeof loginSchema>,
): Promise<VisitorLoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();
  const account = await getVisitorAccountByEmail(parsed.data.email);

  if (!account || !account.password_hash) {
    await verifyPassword('dummy', '$2a$12$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    return { ok: false, error: 'invalid_credentials' };
  }

  const valid = await verifyPassword(parsed.data.password, account.password_hash);
  if (!valid) return { ok: false, error: 'invalid_credentials' };

  const token = await signLongVisitorSessionToken(account.visitor_id);
  const cookieStore = await cookies();
  cookieStore.set(ESPACE_VISITEUR_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ESPACE_VISITEUR_SESSION_LONG_MAX_AGE,
    path: '/',
  });

  try {
    await supabase
      .from('visitor_accounts')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', account.id);
    await supabase.from('audit_log').insert({
      action: 'login',
      entity_type: 'visitors',
      entity_id: account.visitor_id,
      user_id: null,
      before: null,
      after: { kind: 'visitor_password_login', method: 'password' },
    });
  } catch {
    // non bloquant
  }

  return { ok: true };
}

// ─── Set / change password ───────────────────────────────────────────
const setSchema = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8).max(200),
});

export type VisitorSetPasswordResult = { ok: true } | { ok: false; error: string };

export async function setVisitorPasswordAction(
  locale: 'fr' | 'en',
  input: z.infer<typeof setSchema>,
): Promise<VisitorSetPasswordResult> {
  let session: { visitorId: string };
  try {
    session = await requireVisitorSession(locale);
  } catch {
    return { ok: false, error: 'not_authenticated' };
  }

  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const validationError = validatePasswordStrength(parsed.data.new_password);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabaseServiceClient();
  const { data: account } = await supabase
    .from('visitor_accounts')
    .select('id, password_hash')
    .eq('visitor_id', session.visitorId)
    .maybeSingle();
  if (!account) return { ok: false, error: 'not_authenticated' };

  if (account.password_hash) {
    if (!parsed.data.current_password) return { ok: false, error: 'current_password_required' };
    const valid = await verifyPassword(parsed.data.current_password, account.password_hash);
    if (!valid) return { ok: false, error: 'current_password_incorrect' };
  }

  const newHash = await hashPassword(parsed.data.new_password);
  await supabase
    .from('visitor_accounts')
    .update({ password_hash: newHash, password_set_at: new Date().toISOString() })
    .eq('id', account.id);

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: session.visitorId,
    user_id: null,
    before: null,
    after: { kind: 'visitor_password_set', triggered_by: 'self' },
  });

  return { ok: true };
}

// ─── Remove password ─────────────────────────────────────────────────
export type VisitorRemovePasswordResult = { ok: true } | { ok: false; error: string };

export async function removeVisitorPasswordAction(
  locale: 'fr' | 'en',
): Promise<VisitorRemovePasswordResult> {
  let session: { visitorId: string };
  try {
    session = await requireVisitorSession(locale);
  } catch {
    return { ok: false, error: 'not_authenticated' };
  }

  const supabase = getSupabaseServiceClient();
  await supabase
    .from('visitor_accounts')
    .update({ password_hash: null, password_set_at: null })
    .eq('visitor_id', session.visitorId);

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: session.visitorId,
    user_id: null,
    before: null,
    after: { kind: 'visitor_password_removed', triggered_by: 'self' },
  });

  return { ok: true };
}
