'use server';

/**
 * P15.3 — actions admin : gestion auth visiteurs (fiche admin).
 * Cloné de auth-admin-actions.ts partenaire. Audit : action enum + after.kind.
 *
 *   adminCreateVisitorAccountAction    : crée le compte (admin/super_admin)
 *   adminTriggerVisitorMagicLinkAction : renvoyer magic link
 *   adminTriggerVisitorPasswordResetAction : envoyer lien reset
 *   adminRemoveVisitorPasswordAction   : forcer suppression password (super_admin)
 */

import { z } from 'zod';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { signVisitorMagicToken } from '@/lib/espace-visiteur/jwt';
import { ensureVisitorAccount } from '@/lib/espace-visiteur/accounts';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderEspaceVisiteurMagicLinkTemplate } from '@/lib/resend/templates/espace-visiteur-magic-link';
import { capitalizeName } from '@/lib/format/name';

const schema = z.object({ visitor_id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

/** Charge le visiteur + email/prénom du contact. */
async function loadVisitorContact(
  visitorId: string,
): Promise<{ email: string; firstName: string | null } | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('visitors')
    .select('id, contact:contacts!visitors_contact_id_fkey(email, first_name)')
    .eq('id', visitorId)
    .maybeSingle();
  if (!data) return null;
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  if (!contact?.email) return null;
  return { email: contact.email, firstName: contact.first_name ?? null };
}

export async function adminCreateVisitorAccountAction(
  input: z.infer<typeof schema>,
): Promise<Result> {
  const admin = await requireAdminProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const info = await loadVisitorContact(parsed.data.visitor_id);
  if (!info) return { ok: false, error: 'visitor_not_found' };

  const supabase = getSupabaseServiceClient();
  await ensureVisitorAccount(parsed.data.visitor_id, info.email);

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: parsed.data.visitor_id,
    user_id: admin.id,
    before: null,
    after: { kind: 'visitor_account_created', triggered_by: 'admin' },
  });

  revalidatePath(`/admin/visitors/${parsed.data.visitor_id}`);
  return { ok: true };
}

export async function adminTriggerVisitorMagicLinkAction(
  input: z.infer<typeof schema>,
): Promise<Result> {
  const admin = await requireAdminProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const info = await loadVisitorContact(parsed.data.visitor_id);
  if (!info) return { ok: false, error: 'visitor_not_found' };

  const supabase = getSupabaseServiceClient();
  await ensureVisitorAccount(parsed.data.visitor_id, info.email);

  const locale = 'fr';
  const token = await signVisitorMagicToken(parsed.data.visitor_id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/api/espace-visiteur/login?token=${encodeURIComponent(token)}&locale=${locale}`;
  const requestPageUrl = `${baseUrl}/${locale}/espace-visiteur`;

  const tpl = renderEspaceVisiteurMagicLinkTemplate(locale, {
    firstName: capitalizeName(info.firstName ?? '') || 'cher visiteur',
    magicLinkUrl,
    requestPageUrl,
  });

  await sendTransactionalEmailViaResend({
    to: info.email,
    toName: info.firstName ?? undefined,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: 'category', value: 'espace_visiteur_magic_link' },
      { name: 'triggered_by', value: 'admin' },
    ],
  });

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: parsed.data.visitor_id,
    user_id: admin.id,
    before: null,
    after: { kind: 'admin_triggered_visitor_magic_link', email: info.email, triggered_by: 'admin' },
  });

  return { ok: true };
}

export async function adminTriggerVisitorPasswordResetAction(
  input: z.infer<typeof schema>,
): Promise<Result> {
  const admin = await requireAdminProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const info = await loadVisitorContact(parsed.data.visitor_id);
  if (!info) return { ok: false, error: 'visitor_not_found' };

  const supabase = getSupabaseServiceClient();
  const accountId = await ensureVisitorAccount(parsed.data.visitor_id, info.email);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await supabase.from('visitor_password_reset_tokens').insert({
    token,
    visitor_account_id: accountId,
    expires_at: expiresAt.toISOString(),
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/fr/espace-visiteur/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
  const firstName = capitalizeName(info.firstName ?? '') || 'cher visiteur';

  await sendTransactionalEmailViaResend({
    to: info.email,
    toName: info.firstName ?? undefined,
    subject: 'Définir ou réinitialiser votre mot de passe visiteur MediaDays Solutions',
    html: `
<p>Bonjour ${firstName},</p>
<p>L'équipe MediaDays Solutions vous envoie un lien pour définir ou réinitialiser votre mot de passe visiteur.</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="background:#031a56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Choisir un mot de passe</a>
</p>
<p style="font-size:12px;color:#666">Ce lien expire dans 30 minutes.</p>
`,
    text: `Lien de réinitialisation : ${resetUrl}`,
    tags: [
      { name: 'category', value: 'visitor_password_reset' },
      { name: 'triggered_by', value: 'admin' },
    ],
  });

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: parsed.data.visitor_id,
    user_id: admin.id,
    before: null,
    after: {
      kind: 'admin_triggered_visitor_password_reset',
      email: info.email,
      triggered_by: 'admin',
    },
  });

  return { ok: true };
}

export async function adminRemoveVisitorPasswordAction(
  input: z.infer<typeof schema>,
): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = getSupabaseServiceClient();
  await supabase
    .from('visitor_accounts')
    .update({ password_hash: null, password_set_at: null })
    .eq('visitor_id', parsed.data.visitor_id);

  await supabase.from('audit_log').insert({
    action: 'update',
    entity_type: 'visitors',
    entity_id: parsed.data.visitor_id,
    user_id: admin.id,
    before: null,
    after: { kind: 'admin_removed_visitor_password', triggered_by: 'admin_force_remove' },
  });

  revalidatePath(`/admin/visitors/${parsed.data.visitor_id}`);
  return { ok: true };
}
