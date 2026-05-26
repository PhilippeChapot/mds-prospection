'use server';

/**
 * P5.x.1 — server actions admin users.
 *
 * Actions :
 *   - inviteUserAction      (super_admin) -> create + magic link Supabase
 *   - updateUserRoleAction  (super_admin) -> change role + garde-fou dernier super_admin
 *   - archiveUserAction     (super_admin) -> soft delete + garde-fou
 *   - unarchiveUserAction   (super_admin) -> restore
 *   - resendInviteAction    (super_admin) -> re-déclenche magic link
 *
 * Doctrine : toutes les mutations role/archive sont super_admin only +
 * audit log strict avec `kind=role_changed|invited|archived|...` dans
 * after. Les garde-fous existent côté DB (migration 0058, triggers
 * check_last_super_admin_*) ET côté code ici (defense in depth).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderAdminUserInviteTemplate } from '@/lib/resend/templates/admin-user-invite';
import { countActiveSuperAdmins, getUserById, type UserRole } from './queries';

const LOG_PREFIX = '[admin/users]';

const ROLE_ENUM = z.enum(['admin', 'sales', 'super_admin']);

// ---------------------------------------------------------------------------
// inviteUserAction
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(100),
  role: ROLE_ENUM,
  language: z.enum(['fr', 'en']).default('fr'),
});

export type InviteUserResult =
  | { ok: true; user_id: string; magic_link_sent: boolean }
  | { ok: false; error: string };

export async function inviteUserAction(
  // P5.x.1-bis : `z.input` (pas `z.infer`) pour que `language` soit optionnel
  // au point d'appel (Zod default('fr') le remplit côté serveur).
  input: z.input<typeof inviteSchema>,
): Promise<InviteUserResult> {
  let actorId: string;
  let actorRole: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
    actorRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const data = parsed.data;

  const supabase = getSupabaseServiceClient();

  // 1. Anti-doublon côté public.users (auth.users sera vérifié par
  //    inviteUserByEmail qui retourne une erreur "already registered").
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, archived_at')
    .eq('email', data.email)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: existing.archived_at
        ? "Email déjà utilisé par un user archivé. Désarchivez-le d'abord."
        : 'Email déjà utilisé.',
    };
  }

  // 2. Generate Supabase invite link SANS envoi automatique d'email
  //    (P5.x.1-bis : on remplace le template Supabase par notre template
  //    Resend custom FR/EN avec branding MDS — cf. brief).
  //    `redirectTo` pointe vers /admin?invited=1 pour la bannière welcome.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const adminHomeUrl = `${appUrl}/admin`;
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: data.email,
    options: {
      data: { full_name: data.full_name, role: data.role, language: data.language },
      redirectTo: `${adminHomeUrl}?invited=1`,
    },
  });
  if (linkErr || !linkData?.user?.id || !linkData.properties?.action_link) {
    console.error(
      '%s generate-link-failed email=%s msg=%s',
      LOG_PREFIX,
      data.email,
      linkErr?.message,
    );
    return {
      ok: false,
      error: linkErr?.message ?? "Échec de la génération du lien d'invitation Supabase.",
    };
  }
  const inviteUrl = linkData.properties.action_link;
  const userId = linkData.user.id;

  // 3. UPSERT public.users (le trigger `on_auth_user_created` peut déjà
  //    avoir créé la ligne avec role='sales' par défaut — on override
  //    avec les valeurs choisies par l'admin invitant).
  const { error: upsertErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      language: data.language,
    },
    { onConflict: 'id' },
  );
  if (upsertErr) {
    console.error('%s upsert-public-failed id=%s msg=%s', LOG_PREFIX, userId, upsertErr.message);
    return {
      ok: false,
      error: `Compte Supabase créé mais public.users KO : ${upsertErr.message}`,
    };
  }

  // 4. Envoi de l'email Resend custom (FR ou EN selon language).
  //    Best-effort : si l'envoi rate, le user existe quand même, on log
  //    et on retourne ok:false pour que l'admin le sache.
  try {
    const tpl = renderAdminUserInviteTemplate(data.language, {
      fullName: data.full_name,
      role: data.role,
      inviteUrl,
      adminHomeUrl,
    });
    await sendTransactionalEmailViaResend({
      to: data.email,
      toName: data.full_name,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: 'category', value: 'admin_user_invite' },
        { name: 'locale', value: data.language },
      ],
    });
  } catch (mailErr) {
    console.error(
      '%s resend-failed email=%s msg=%s',
      LOG_PREFIX,
      data.email,
      mailErr instanceof Error ? mailErr.message : String(mailErr),
    );
    return {
      ok: false,
      error: `Compte créé mais email d'invitation non envoyé : ${
        mailErr instanceof Error ? mailErr.message : String(mailErr)
      }. Utilisez "Renvoyer invite".`,
    };
  }

  // Audit log.
  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'create',
      entity_type: 'users',
      entity_id: userId,
      after: {
        kind: 'invited',
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        language: data.language,
        actor_role: actorRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  console.log(
    '%s invited email=%s role=%s lang=%s by=%s',
    LOG_PREFIX,
    data.email,
    data.role,
    data.language,
    actorId,
  );
  revalidatePath('/admin/users');
  return { ok: true, user_id: userId, magic_link_sent: true };
}

// ---------------------------------------------------------------------------
// updateUserRoleAction
// ---------------------------------------------------------------------------

const updateRoleSchema = z.object({
  user_id: z.string().uuid(),
  new_role: ROLE_ENUM,
  reason: z.string().trim().min(3).max(500),
});

export type UpdateUserRoleResult = { ok: true; new_role: UserRole } | { ok: false; error: string };

export async function updateUserRoleAction(
  input: z.infer<typeof updateRoleSchema>,
): Promise<UpdateUserRoleResult> {
  let actorId: string;
  let actorRole: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
    actorRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }

  const before = await getUserById(parsed.data.user_id);
  if (!before) return { ok: false, error: 'Utilisateur introuvable.' };
  if (before.archived_at) return { ok: false, error: 'Utilisateur archivé : désarchivez avant.' };
  if (before.role === parsed.data.new_role) {
    return { ok: false, error: 'Le rôle est déjà ' + parsed.data.new_role };
  }

  // Garde-fou côté code : downgrade du dernier super_admin.
  if (before.role === 'super_admin' && parsed.data.new_role !== 'super_admin') {
    const otherSupers = await countActiveSuperAdmins(before.id);
    if (otherSupers === 0) {
      return {
        ok: false,
        error: 'Impossible de downgrader le dernier super_admin actif du système.',
      };
    }
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('users')
    .update({ role: parsed.data.new_role })
    .eq('id', parsed.data.user_id);
  if (error) {
    console.error(
      '%s update-role-failed id=%s msg=%s',
      LOG_PREFIX,
      parsed.data.user_id,
      error.message,
    );
    return { ok: false, error: error.message };
  }

  // Audit log strict.
  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'update',
      entity_type: 'users',
      entity_id: parsed.data.user_id,
      before: { kind: 'role_changed', role: before.role, email: before.email } as never,
      after: {
        kind: 'role_changed',
        role: parsed.data.new_role,
        previous_role: before.role,
        reason: parsed.data.reason,
        actor_role: actorRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  console.log(
    '%s role-changed id=%s %s -> %s by=%s',
    LOG_PREFIX,
    parsed.data.user_id,
    before.role,
    parsed.data.new_role,
    actorId,
  );
  revalidatePath('/admin/users');
  return { ok: true, new_role: parsed.data.new_role };
}

// ---------------------------------------------------------------------------
// archiveUserAction / unarchiveUserAction
// ---------------------------------------------------------------------------

const archiveSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type ArchiveUserResult = { ok: true; archived: true } | { ok: false; error: string };

export async function archiveUserAction(
  input: z.infer<typeof archiveSchema>,
): Promise<ArchiveUserResult> {
  let actorId: string;
  let actorRole: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
    actorRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }

  const before = await getUserById(parsed.data.user_id);
  if (!before) return { ok: false, error: 'Utilisateur introuvable.' };
  if (before.archived_at) return { ok: false, error: 'Utilisateur déjà archivé.' };

  // Garde-fou côté code.
  if (before.role === 'super_admin') {
    const otherSupers = await countActiveSuperAdmins(before.id);
    if (otherSupers === 0) {
      return {
        ok: false,
        error: "Impossible d'archiver le dernier super_admin actif du système.",
      };
    }
  }

  const supabase = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({ archived_at: nowIso })
    .eq('id', parsed.data.user_id);
  if (error) {
    console.error('%s archive-failed id=%s msg=%s', LOG_PREFIX, parsed.data.user_id, error.message);
    return { ok: false, error: error.message };
  }

  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'update',
      entity_type: 'users',
      entity_id: parsed.data.user_id,
      before: {
        kind: 'archived',
        email: before.email,
        role: before.role,
        full_name: before.full_name,
      } as never,
      after: {
        kind: 'archived',
        archived_at: nowIso,
        reason: parsed.data.reason,
        actor_role: actorRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  console.log('%s archived id=%s by=%s', LOG_PREFIX, parsed.data.user_id, actorId);
  revalidatePath('/admin/users');
  return { ok: true, archived: true };
}

const unarchiveSchema = z.object({ user_id: z.string().uuid() });

export type UnarchiveUserResult = { ok: true } | { ok: false; error: string };

export async function unarchiveUserAction(
  input: z.infer<typeof unarchiveSchema>,
): Promise<UnarchiveUserResult> {
  let actorId: string;
  let actorRole: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
    actorRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = unarchiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const before = await getUserById(parsed.data.user_id);
  if (!before) return { ok: false, error: 'Utilisateur introuvable.' };
  if (!before.archived_at) return { ok: false, error: 'Utilisateur déjà actif.' };

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('users')
    .update({ archived_at: null })
    .eq('id', parsed.data.user_id);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'update',
      entity_type: 'users',
      entity_id: parsed.data.user_id,
      after: {
        kind: 'unarchived',
        email: before.email,
        role: before.role,
        actor_role: actorRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  console.log('%s unarchived id=%s by=%s', LOG_PREFIX, parsed.data.user_id, actorId);
  revalidatePath('/admin/users');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// resendInviteAction
// ---------------------------------------------------------------------------

const resendInviteSchema = z.object({ user_id: z.string().uuid() });

export type ResendInviteResult = { ok: true; magic_link_sent: true } | { ok: false; error: string };

export async function resendInviteAction(
  input: z.infer<typeof resendInviteSchema>,
): Promise<ResendInviteResult> {
  let actorId: string;
  let actorRole: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
    actorRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = resendInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }

  const before = await getUserById(parsed.data.user_id);
  if (!before) return { ok: false, error: 'Utilisateur introuvable.' };
  if (before.archived_at) return { ok: false, error: 'Utilisateur archivé.' };
  if (before.last_login_at) {
    return {
      ok: false,
      error:
        "Cet utilisateur s'est déjà connecté au moins une fois — pas besoin de renvoyer une invite.",
    };
  }

  // P5.x.1-bis : même pattern que inviteUserAction — generateLink (sans
  // envoi auto Supabase) + email Resend custom dans la langue du user.
  const supabase = getSupabaseServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const adminHomeUrl = `${appUrl}/admin`;
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: before.email,
    options: { redirectTo: `${adminHomeUrl}?invited=1` },
  });
  if (linkErr || !linkData.properties?.action_link) {
    console.error(
      '%s resend-link-failed email=%s msg=%s',
      LOG_PREFIX,
      before.email,
      linkErr?.message,
    );
    return { ok: false, error: linkErr?.message ?? 'Échec de la génération du lien.' };
  }

  const userLang: 'fr' | 'en' = before.language === 'en' ? 'en' : 'fr';
  try {
    const tpl = renderAdminUserInviteTemplate(userLang, {
      fullName: before.full_name ?? before.email,
      role: before.role,
      inviteUrl: linkData.properties.action_link,
      adminHomeUrl,
    });
    await sendTransactionalEmailViaResend({
      to: before.email,
      toName: before.full_name ?? undefined,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: 'category', value: 'admin_user_invite_resent' },
        { name: 'locale', value: userLang },
      ],
    });
  } catch (mailErr) {
    console.error(
      '%s resend-email-failed email=%s msg=%s',
      LOG_PREFIX,
      before.email,
      mailErr instanceof Error ? mailErr.message : String(mailErr),
    );
    return {
      ok: false,
      error: mailErr instanceof Error ? mailErr.message : "Échec de l'envoi de l'email.",
    };
  }

  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'update',
      entity_type: 'users',
      entity_id: parsed.data.user_id,
      after: {
        kind: 'invite_resent',
        email: before.email,
        actor_role: actorRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  console.log('%s invite-resent email=%s by=%s', LOG_PREFIX, before.email, actorId);
  return { ok: true, magic_link_sent: true };
}
