'use server';

/**
 * P15.3 — flow reset mot de passe VISITEUR.
 * Cloné de partner-password-reset-actions.ts (visitor_password_reset_tokens).
 * Token : 64 hex chars, TTL 30 min, usage unique. Email via Resend.
 */

import { z } from 'zod';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { findVisitorAuthByEmail, ensureVisitorAccount } from '@/lib/espace-visiteur/accounts';
import { hashPassword, validatePasswordStrength } from './partner-password';

const LOG = '[visitor-password-reset]';

const GENERIC_OK = {
  ok: true as const,
  message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
} as const;

const requestSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

export type VisitorRequestResetResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function requestVisitorPasswordResetAction(
  input: z.infer<typeof requestSchema>,
): Promise<VisitorRequestResetResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { email, locale } = parsed.data;
  const supabase = getSupabaseServiceClient();

  const lookup = await findVisitorAuthByEmail(email);
  if (!lookup) {
    console.log('%s early-return email=%s reason=no_visitor', LOG, email);
    return GENERIC_OK;
  }

  let accountId: string;
  try {
    accountId = await ensureVisitorAccount(lookup.visitorId, lookup.email);
  } catch (err) {
    console.error('%s ensure-account-failed err=%o', LOG, err);
    return GENERIC_OK;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const { error: insertError } = await supabase.from('visitor_password_reset_tokens').insert({
    token,
    visitor_account_id: accountId,
    expires_at: expiresAt.toISOString(),
  });
  if (insertError) {
    console.error('%s token-insert-failed account=%s err=%o', LOG, accountId, insertError);
    return GENERIC_OK;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/${locale}/espace-visiteur/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
  const firstName = lookup.firstName ?? (locale === 'fr' ? 'cher visiteur' : 'dear visitor');

  const subject =
    locale === 'en'
      ? 'Set or reset your MediaDays Solutions visitor password'
      : 'Définir ou réinitialiser votre mot de passe visiteur MediaDays Solutions';

  const html =
    locale === 'en'
      ? `
<p>Hello ${firstName},</p>
<p>You requested to set or reset your password for your MediaDays Solutions visitor account.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Choose a password</a>
</p>
<p style="font-size:12px;color:#666">This link expires in 30 minutes. If you did not make this request, you can safely ignore this email.</p>
`
      : `
<p>Bonjour ${firstName},</p>
<p>Vous avez demandé à définir ou réinitialiser votre mot de passe pour votre espace visiteur MediaDays Solutions.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Choisir un mot de passe</a>
</p>
<p style="font-size:12px;color:#666">Ce lien expire dans 30 minutes. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
`;

  await sendTransactionalEmailViaResend({
    to: email,
    toName: firstName,
    subject,
    html,
    text: `${locale === 'en' ? 'Reset link' : 'Lien de réinitialisation'} : ${resetUrl}`,
    tags: [
      { name: 'category', value: 'visitor_password_reset' },
      { name: 'locale', value: locale },
    ],
  });

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: lookup.visitorId,
    user_id: null,
    before: null,
    after: { kind: 'visitor_password_reset_requested', triggered_by: 'self', locale },
  });

  console.log('%s email-sent visitor=%s locale=%s', LOG, lookup.visitorId, locale);
  return GENERIC_OK;
}

// ─── Consume ─────────────────────────────────────────────────────────
const consumeSchema = z.object({
  token: z.string().min(32).max(128),
  new_password: z.string().min(8).max(200),
});

export type VisitorConsumeResetResult = { ok: true } | { ok: false; error: string };

export async function consumeVisitorPasswordResetAction(
  input: z.infer<typeof consumeSchema>,
): Promise<VisitorConsumeResetResult> {
  const parsed = consumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const validationError = validatePasswordStrength(parsed.data.new_password);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabaseServiceClient();
  const { data: tokenRow, error: tokenError } = await supabase
    .from('visitor_password_reset_tokens')
    .select('token, visitor_account_id, expires_at, used_at')
    .eq('token', parsed.data.token)
    .maybeSingle();

  if (tokenError) {
    console.error('%s consume-db-error err=%o', LOG, tokenError);
    return { ok: false, error: 'server_error' };
  }
  if (!tokenRow) return { ok: false, error: 'token_invalid' };
  if (tokenRow.used_at) return { ok: false, error: 'token_already_used' };
  if (new Date(tokenRow.expires_at) < new Date()) return { ok: false, error: 'token_expired' };

  const newHash = await hashPassword(parsed.data.new_password);

  await supabase
    .from('visitor_accounts')
    .update({ password_hash: newHash, password_set_at: new Date().toISOString() })
    .eq('id', tokenRow.visitor_account_id);

  await supabase
    .from('visitor_password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', parsed.data.token);

  // Résout visitor_id pour l'audit (timeline fiche visiteur).
  const { data: account } = await supabase
    .from('visitor_accounts')
    .select('visitor_id')
    .eq('id', tokenRow.visitor_account_id)
    .maybeSingle();

  if (account) {
    await supabase.from('audit_log').insert({
      action: 'update',
      entity_type: 'visitors',
      entity_id: account.visitor_id,
      user_id: null,
      before: null,
      after: { kind: 'visitor_password_reset_consumed', triggered_by: 'self' },
    });
  }

  console.log('%s reset-consumed account=%s', LOG, tokenRow.visitor_account_id);
  return { ok: true };
}
