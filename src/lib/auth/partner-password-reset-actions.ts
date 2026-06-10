'use server';

/**
 * P11.x.PartnerPasswordOptional — flow reset mot de passe partenaire.
 *
 * requestPartnerPasswordResetAction  : email → token + email Resend
 * consumePartnerPasswordResetAction  : token + nouveau password → update
 *
 * Anti-enumeration : réponse générique si contact inexistant ou sans password.
 * Email via Resend (doctrine feedback_resend_for_transactional_not_brevo).
 * Token : 64 hex chars aléatoires, TTL 30 min, usage unique.
 */

import { z } from 'zod';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { hashPassword, validatePasswordStrength } from './partner-password';

const LOG = '[partner-password-reset]';

const GENERIC_OK = {
  ok: true as const,
  message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
} as const;

// ─── Request reset ───────────────────────────────────────────────────

const requestSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

export type RequestResetResult = { ok: true; message: string } | { ok: false; error: string };

export async function requestPartnerPasswordResetAction(
  input: z.infer<typeof requestSchema>,
): Promise<RequestResetResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { email, locale } = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: contact, error: selectError } = await supabase
    .from('contacts')
    .select('id, first_name, password_hash')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  // Log DB errors — révèle les problèmes de migration (colonne inexistante, etc.)
  if (selectError) {
    console.error('%s db-select-error email=%s err=%o', LOG, email, selectError);
    return GENERIC_OK;
  }

  // Anti-enumeration : réponse générique si inconnu ou sans password configuré.
  if (!contact || !contact.password_hash) {
    console.log(
      '%s early-return email=%s reason=%s',
      LOG,
      email,
      !contact ? 'contact_not_found' : 'no_password_set',
    );
    return GENERIC_OK;
  }

  // Générer token 64 hex chars (32 bytes)
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const { error: insertError } = await supabase.from('partner_password_reset_tokens').insert({
    token,
    contact_id: contact.id,
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    // Table inexistante = migration 0092 non appliquée
    console.error('%s token-insert-failed contact_id=%s err=%o', LOG, contact.id, insertError);
    return GENERIC_OK;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/${locale}/espace-partenaire/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;

  const firstName = contact.first_name ?? (locale === 'fr' ? 'cher partenaire' : 'dear partner');

  const subject =
    locale === 'en'
      ? 'Reset your MediaDays Solutions password'
      : 'Réinitialisation de votre mot de passe MediaDays Solutions';

  const html =
    locale === 'en'
      ? `
<p>Hello ${firstName},</p>
<p>You requested a password reset for your MediaDays Solutions partner account.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
    Set a new password
  </a>
</p>
<p style="font-size:12px;color:#666">This link expires in 30 minutes. If you did not make this request, you can safely ignore this email.</p>
`
      : `
<p>Bonjour ${firstName},</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe pour votre espace partenaire MediaDays Solutions.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
    Choisir un nouveau mot de passe
  </a>
</p>
<p style="font-size:12px;color:#666">Ce lien expire dans 30 minutes. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
`;

  // Pas de try/catch — on laisse propager pour visibilité dans Vercel logs.
  // Une erreur Resend ici = vrai problème config/quota, pas anti-enumeration.
  await sendTransactionalEmailViaResend({
    to: email,
    toName: firstName,
    subject,
    html,
    text: `${locale === 'en' ? 'Reset link' : 'Lien de réinitialisation'} : ${resetUrl}`,
    tags: [
      { name: 'category', value: 'partner_password_reset' },
      { name: 'locale', value: locale },
    ],
  });

  console.log('%s email-sent contact_id=%s locale=%s', LOG, contact.id, locale);

  await supabase.from('audit_log').insert({
    action: 'partner_password_reset_requested',
    entity_type: 'contacts',
    entity_id: contact.id,
    user_id: null,
    before: null,
    after: { triggered_by: 'self', locale },
  });

  return GENERIC_OK;
}

// ─── Consume reset ───────────────────────────────────────────────────

const consumeSchema = z.object({
  token: z.string().min(32).max(128),
  new_password: z.string().min(8).max(200),
});

export type ConsumeResetResult = { ok: true } | { ok: false; error: string };

export async function consumePartnerPasswordResetAction(
  input: z.infer<typeof consumeSchema>,
): Promise<ConsumeResetResult> {
  const parsed = consumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const validationError = validatePasswordStrength(parsed.data.new_password);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabaseServiceClient();

  const { data: tokenRow, error: tokenError } = await supabase
    .from('partner_password_reset_tokens')
    .select('*')
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
    .from('contacts')
    .update({ password_hash: newHash, password_set_at: new Date().toISOString() })
    .eq('id', tokenRow.contact_id);

  await supabase
    .from('partner_password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', parsed.data.token);

  await supabase.from('audit_log').insert({
    action: 'partner_password_reset_consumed',
    entity_type: 'contacts',
    entity_id: tokenRow.contact_id,
    user_id: null,
    before: null,
    after: { triggered_by: 'self' },
  });

  console.log('%s reset-consumed contact_id=%s', LOG, tokenRow.contact_id);

  return { ok: true };
}
