'use server';

/**
 * P11.x.PartnerPasswordOptional — actions admin : gestion auth partenaires.
 *
 * adminTriggerMagicLinkAction        : renvoyer magic link (admin ou super_admin)
 * adminTriggerPasswordResetAction    : envoyer lien reset password (admin ou super_admin)
 * adminRemovePartnerPasswordAction   : forcer suppression password (super_admin only)
 *
 * Audit log : kind admin_triggered_* (différencié de self-triggered)
 * pour traçabilité RH.
 */

import { z } from 'zod';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { signContactMagicToken } from '@/lib/espace-partenaire/jwt';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderEspacePartenaireMagicLinkTemplate } from '@/lib/resend/templates/espace-partenaire-magic-link';
import { capitalizeName } from '@/lib/format/name';

const schema = z.object({ contact_id: z.string().uuid() });

// ─── Renvoyer un magic link ──────────────────────────────────────────

export type AdminMagicLinkResult = { ok: true } | { ok: false; error: string };

export async function adminTriggerMagicLinkAction(
  input: z.infer<typeof schema>,
): Promise<AdminMagicLinkResult> {
  const adminProfile = await requireAdminProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();

  const { data: contact } = (await supabase
    .from('contacts')
    .select('id, email, first_name')
    .eq('id', parsed.data.contact_id)
    .maybeSingle()) as { data: { id: string; email: string; first_name: string | null } | null };

  if (!contact) return { ok: false, error: 'contact_not_found' };

  const locale = 'fr';
  const token = await signContactMagicToken(contact.id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/api/espace-partenaire/login?token=${encodeURIComponent(token)}&locale=${locale}`;
  const requestPageUrl = `${baseUrl}/${locale}/espace-partenaire`;

  const tpl = renderEspacePartenaireMagicLinkTemplate(locale, {
    firstName: capitalizeName(contact.first_name ?? '') || 'cher partenaire',
    magicLinkUrl,
    requestPageUrl,
  });

  await sendTransactionalEmailViaResend({
    to: contact.email,
    toName: contact.first_name ?? undefined,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: 'category', value: 'espace_partenaire_magic_link' },
      { name: 'triggered_by', value: 'admin' },
    ],
  });

  await supabase.from('audit_log').insert({
    action: 'admin_triggered_partner_magic_link',
    entity_type: 'contacts',
    entity_id: contact.id,
    user_id: adminProfile.id,
    before: null,
    after: { email: contact.email, triggered_by: 'admin_button' },
  });

  return { ok: true };
}

// ─── Envoyer lien reset password ─────────────────────────────────────

export type AdminPasswordResetResult = { ok: true } | { ok: false; error: string };

export async function adminTriggerPasswordResetAction(
  input: z.infer<typeof schema>,
): Promise<AdminPasswordResetResult> {
  const adminProfile = await requireAdminProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();

  const { data: contact } = (await supabase
    .from('contacts')
    .select('id, email, first_name, password_hash')
    .eq('id', parsed.data.contact_id)
    .maybeSingle()) as {
    data: {
      id: string;
      email: string;
      first_name: string | null;
      password_hash: string | null;
    } | null;
  };

  if (!contact) return { ok: false, error: 'contact_not_found' };
  if (!contact.password_hash) return { ok: false, error: 'no_password_set' };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await supabase.from('partner_password_reset_tokens').insert({
    token,
    contact_id: contact.id,
    expires_at: expiresAt.toISOString(),
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/fr/espace-partenaire/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
  const firstName = contact.first_name ?? 'cher partenaire';

  await sendTransactionalEmailViaResend({
    to: contact.email,
    toName: contact.first_name ?? undefined,
    subject: 'Réinitialisation de votre mot de passe MediaDays Solutions',
    html: `
<p>Bonjour ${capitalizeName(firstName)},</p>
<p>L'équipe MediaDays Solutions vous envoie un lien pour réinitialiser votre mot de passe.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
    Choisir un nouveau mot de passe
  </a>
</p>
<p style="font-size:12px;color:#666">Ce lien expire dans 30 minutes.</p>
`,
    text: `Lien de réinitialisation : ${resetUrl}`,
    tags: [
      { name: 'category', value: 'partner_password_reset' },
      { name: 'triggered_by', value: 'admin' },
    ],
  });

  await supabase.from('audit_log').insert({
    action: 'admin_triggered_partner_password_reset',
    entity_type: 'contacts',
    entity_id: contact.id,
    user_id: adminProfile.id,
    before: null,
    after: { email: contact.email, triggered_by: 'admin_button' },
  });

  return { ok: true };
}

// ─── Supprimer le password (super_admin only) ─────────────────────────

export type AdminRemovePasswordResult = { ok: true } | { ok: false; error: string };

export async function adminRemovePartnerPasswordAction(
  input: z.infer<typeof schema>,
): Promise<AdminRemovePasswordResult> {
  const adminProfile = await requireSuperAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();

  await supabase
    .from('contacts')
    .update({ password_hash: null, password_set_at: null })
    .eq('id', parsed.data.contact_id);

  await supabase.from('audit_log').insert({
    action: 'admin_removed_partner_password',
    entity_type: 'contacts',
    entity_id: parsed.data.contact_id,
    user_id: adminProfile.id,
    before: null,
    after: { triggered_by: 'admin_force_remove' },
  });

  return { ok: true };
}
