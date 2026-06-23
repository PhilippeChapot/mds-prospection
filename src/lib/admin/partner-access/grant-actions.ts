'use server';

/**
 * P11.x.MultiPartnerAccess — server actions admin gestion accès espace partenaire.
 *
 *   grantPartnerAccessAction       : créer un grant (admin+)
 *   revokePartnerAccessAction      : révoquer un grant (super_admin — destructif)
 *   resendPartnerMagicLinkAction   : renvoyer magic link à un contact avec grant actif
 */

import { z } from 'zod';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { signContactMagicToken } from '@/lib/espace-partenaire/jwt';
import { renderEspacePartenaireMagicLinkTemplate } from '@/lib/resend/templates/espace-partenaire-magic-link';
import { capitalizeName } from '@/lib/format/name';
import { revalidatePath } from 'next/cache';

// partner_access_grants n'est pas encore dans les types générés — SupabaseClient<any>
// accepte n'importe quel nom de table (Database = any par défaut).
const asDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

// ─── Types internes ───────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_id: string | null;
  language: string | null;
}

// ─── GRANT ────────────────────────────────────────────────────────────────────

const grantSchema = z.object({
  contact_id: z.string().uuid(),
  role: z.enum(['owner', 'collaborator', 'viewer']).default('collaborator'),
  notes: z.string().max(500).optional(),
  send_magic_link: z.boolean().default(true),
});

export type GrantPartnerAccessResult =
  | { success: true; grant_id: string }
  | { success: false; error: string; existing_grant_id?: string };

export async function grantPartnerAccessAction(
  input: z.input<typeof grantSchema>,
): Promise<GrantPartnerAccessResult> {
  const admin = await requireAdminProfile();
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrée invalide.' };

  const supabase = getSupabaseServiceClient();

  // 1. Récup le contact + sa company
  const { data: contact, error: cerr } = (await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, company_id, language')
    .eq('id', parsed.data.contact_id)
    .maybeSingle()) as { data: ContactRow | null; error: unknown };

  if (cerr || !contact) return { success: false, error: 'Contact introuvable.' };
  if (!contact.company_id)
    return {
      success: false,
      error: "Ce contact n'a pas de société associée — impossible de donner accès.",
    };
  if (!contact.email)
    return {
      success: false,
      error: "Ce contact n'a pas d'email — impossible d'envoyer le magic link.",
    };

  // 2. Anti-doublon
  const { data: existing } = (await asDb(supabase)
    .from('partner_access_grants')
    .select('id')
    .eq('contact_id', parsed.data.contact_id)
    .is('revoked_at', null)
    .maybeSingle()) as { data: { id: string } | null };

  if (existing) {
    return {
      success: false,
      error: 'Ce contact a déjà un accès actif.',
      existing_grant_id: existing.id,
    };
  }

  // 3. Insert grant
  const { data: grant, error: ierr } = (await asDb(supabase)
    .from('partner_access_grants')
    .insert({
      contact_id: parsed.data.contact_id,
      company_id: contact.company_id,
      role: parsed.data.role,
      granted_by_user_id: admin.id,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (ierr || !grant) return { success: false, error: ierr?.message ?? 'Erreur INSERT.' };

  // 4. Audit log
  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'create',
    entity_type: 'partner_access_grant',
    entity_id: grant.id,
    after: {
      kind: 'partner_grant_created',
      contact_id: parsed.data.contact_id,
      company_id: contact.company_id,
      role: parsed.data.role,
    } as never,
  });

  // 5. Magic link best-effort
  if (parsed.data.send_magic_link) {
    try {
      await sendPartnerMagicLink(contact);
    } catch (err) {
      console.warn('[grantPartnerAccess] magic link send failed:', err);
    }
  }

  revalidatePath(`/admin/companies/${contact.company_id}`);
  return { success: true, grant_id: grant.id };
}

// ─── REVOKE ───────────────────────────────────────────────────────────────────

export type RevokePartnerAccessResult = { success: true } | { success: false; error: string };

export async function revokePartnerAccessAction(
  grant_id: string,
): Promise<RevokePartnerAccessResult> {
  const admin = await requireSuperAdmin();
  const supabase = getSupabaseServiceClient();

  const { data: grant } = (await asDb(supabase)
    .from('partner_access_grants')
    .select('id, contact_id, company_id, revoked_at')
    .eq('id', grant_id)
    .maybeSingle()) as {
    data: {
      id: string;
      contact_id: string;
      company_id: string;
      revoked_at: string | null;
    } | null;
  };

  if (!grant) return { success: false, error: 'Grant introuvable.' };
  if (grant.revoked_at) return { success: false, error: 'Déjà révoqué.' };

  const { error } = await asDb(supabase)
    .from('partner_access_grants')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: admin.id,
    })
    .eq('id', grant_id);

  if (error) return { success: false, error: (error as { message: string }).message };

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'delete',
    entity_type: 'partner_access_grant',
    entity_id: grant_id,
    after: {
      kind: 'partner_grant_revoked',
      contact_id: grant.contact_id,
      company_id: grant.company_id,
    } as never,
  });

  revalidatePath(`/admin/companies/${grant.company_id}`);
  return { success: true };
}

// ─── RESEND MAGIC LINK ────────────────────────────────────────────────────────

export type ResendPartnerMagicLinkResult = { success: true } | { success: false; error: string };

export async function resendPartnerMagicLinkAction(
  contact_id: string,
): Promise<ResendPartnerMagicLinkResult> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  // Vérifie que le contact a un grant actif
  const { data: grantRow } = (await asDb(supabase)
    .from('partner_access_grants')
    .select('id')
    .eq('contact_id', contact_id)
    .is('revoked_at', null)
    .maybeSingle()) as { data: { id: string } | null };

  if (!grantRow) return { success: false, error: "Pas d'accès actif pour ce contact." };

  const { data: contact } = (await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, company_id, language')
    .eq('id', contact_id)
    .maybeSingle()) as { data: ContactRow | null; error: unknown };

  if (!contact?.email) return { success: false, error: 'Contact ou email introuvable.' };

  try {
    await sendPartnerMagicLink(contact);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Helper interne ───────────────────────────────────────────────────────────

async function sendPartnerMagicLink(contact: ContactRow): Promise<void> {
  const locale: 'fr' | 'en' = contact.language?.toUpperCase() === 'EN' ? 'en' : 'fr';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const token = await signContactMagicToken(contact.id);
  const magicLinkUrl = `${baseUrl}/api/espace-partenaire/login?token=${encodeURIComponent(token)}&locale=${locale}`;
  const requestPageUrl = `${baseUrl}/${locale}/espace-partenaire`;
  const firstName = capitalizeName(contact.first_name ?? '') || 'cher partenaire';

  const tpl = renderEspacePartenaireMagicLinkTemplate(locale, {
    firstName,
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
      { name: 'triggered_by', value: 'admin_grant' },
    ],
  });
}
