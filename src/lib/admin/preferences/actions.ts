'use server';

/**
 * P2.x.1 — server actions admin pour `app_settings`.
 *
 * Actions :
 *   - upsertSettingAction  : admin -> create OR update + audit log
 *   - deleteSettingAction  : super_admin only + audit log strict
 *   - getSettingByKeyAction : admin -> read (utile pour ouvrir le drawer)
 *
 * Validation : si la `key` existe dans SETTINGS_REGISTRY, on valide `value`
 * contre le schema Zod du registry. Sinon JSON libre (admin assume).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { validateSettingValue, APP_SETTING_CATEGORIES } from './registry';
import { getSettingByKey, type SettingRow } from './queries';

const LOG_PREFIX = '[admin/preferences]';

const upsertSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_]+$/, 'Slug invalide (a-z, 0-9, underscores uniquement).'),
  value: z.unknown(),
  category: z.enum(APP_SETTING_CATEGORIES),
  description: z.string().trim().max(500).nullable().optional(),
});

export type UpsertSettingResult =
  | { ok: true; created: boolean; key: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function upsertSettingAction(
  input: z.infer<typeof upsertSchema>,
): Promise<UpsertSettingResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validation échouée.',
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
      ),
    };
  }
  const data = parsed.data;

  // Validation registry si key connue.
  const valueCheck = validateSettingValue(data.key, data.value);
  if (!valueCheck.ok) {
    return { ok: false, error: valueCheck.error, fieldErrors: { value: valueCheck.error } };
  }

  const supabase = getSupabaseServiceClient();

  // Lookup avant pour audit log + détecter create vs update.
  const before = await getSettingByKey(data.key);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: data.key,
      value: valueCheck.value as never,
      category: data.category,
      description: data.description ?? before?.description ?? null,
      updated_by_user_id: profile.id,
      updated_at: nowIso,
    },
    { onConflict: 'key' },
  );
  if (error) {
    console.error('%s upsert-error key=%s msg=%s', LOG_PREFIX, data.key, error.message);
    return { ok: false, error: error.message };
  }

  const created = !before;

  // Audit log best-effort.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: created ? 'create' : 'update',
      entity_type: 'app_settings',
      // entity_id est UUID nullable côté audit_log : key textuelle non
      // mappable -> on laisse null mais on stocke key dans after.
      entity_id: null,
      before: before
        ? ({
            kind: 'setting_updated',
            key: before.key,
            value: before.value,
            category: before.category,
          } as never)
        : null,
      after: {
        kind: created ? 'setting_created' : 'setting_updated',
        key: data.key,
        value: valueCheck.value,
        category: data.category,
        actor_role: profile.role,
      } as never,
    });
  } catch (auditErr) {
    console.warn(
      '%s audit-log-failed key=%s msg=%s',
      LOG_PREFIX,
      data.key,
      auditErr instanceof Error ? auditErr.message : String(auditErr),
    );
  }

  console.log('%s upsert-ok key=%s created=%s by=%s', LOG_PREFIX, data.key, created, profile.id);

  revalidatePath('/admin/preferences');
  return { ok: true, created, key: data.key };
}

const deleteSchema = z.object({
  key: z.string().trim().min(2).max(80),
  reason: z.string().trim().min(3).max(500),
});

export type DeleteSettingResult = { ok: true; deleted: true } | { ok: false; error: string };

export async function deleteSettingAction(
  input: z.infer<typeof deleteSchema>,
): Promise<DeleteSettingResult> {
  let profileId: string;
  let profileRole: string;
  try {
    const profile = await requireSuperAdmin();
    profileId = profile.id;
    profileRole = profile.role;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }

  const supabase = getSupabaseServiceClient();
  const before = await getSettingByKey(parsed.data.key);
  if (!before) return { ok: false, error: 'Setting introuvable.' };

  const { error } = await supabase.from('app_settings').delete().eq('key', parsed.data.key);
  if (error) {
    console.error('%s delete-error key=%s msg=%s', LOG_PREFIX, parsed.data.key, error.message);
    return { ok: false, error: error.message };
  }

  // Audit log strict (super_admin destructif).
  try {
    await supabase.from('audit_log').insert({
      user_id: profileId,
      action: 'delete',
      entity_type: 'app_settings',
      entity_id: null,
      before: {
        kind: 'setting_deleted',
        key: before.key,
        value: before.value,
        category: before.category,
        description: before.description,
      } as never,
      after: {
        kind: 'setting_deleted',
        key: parsed.data.key,
        reason: parsed.data.reason,
        actor_role: profileRole,
      } as never,
    });
  } catch (auditErr) {
    console.warn(
      '%s audit-log-failed key=%s msg=%s',
      LOG_PREFIX,
      parsed.data.key,
      auditErr instanceof Error ? auditErr.message : String(auditErr),
    );
  }

  console.log('%s delete-ok key=%s by=%s', LOG_PREFIX, parsed.data.key, profileId);
  revalidatePath('/admin/preferences');
  return { ok: true, deleted: true };
}

export type GetSettingResult = { ok: true; data: SettingRow } | { ok: false; error: string };

export async function getSettingByKeyAction(input: { key: string }): Promise<GetSettingResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const row = await getSettingByKey(input.key);
  if (!row) return { ok: false, error: 'Setting introuvable.' };
  return { ok: true, data: row };
}
