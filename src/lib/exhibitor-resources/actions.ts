'use server';

/**
 * P3.1 — Server actions pour les ressources exposant (guide markdown bilingue).
 *
 * Actions :
 *   - listResourcesAction       : admin only, liste complète (publiées + non)
 *   - getPublishedResourcesAction : public (RLS), liste publiée projetée par locale
 *   - upsertResourceAction      : admin only, create/update + audit log
 *   - deleteResourceAction      : admin only, hard delete + audit log
 *
 * Auth : `requireAdminProfile()` reconnaît admin OR sales OR super_admin
 * (cf. lib/supabase/auth-helpers.ts). On utilise `hasAdminAccess()` pour
 * être explicite côté action et exclure 'sales' si on voulait — ici on
 * laisse sales écrire (cohérent avec la RLS `exhibitor_resources_admin_write`
 * qui passe par `is_admin_or_sales()`).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[exhibitor-resources]';

// ---------------------------------------------------------------------------
// Types publics partagés
// ---------------------------------------------------------------------------

export type ExhibitorResourceRow = {
  id: string;
  slug: string;
  title_fr: string;
  title_en: string;
  body_fr: string | null;
  body_en: string | null;
  is_published: boolean;
  display_order: number;
  updated_at: string;
  updated_by_user_id: string | null;
  created_at: string;
};

export type PublishedResource = {
  id: string;
  slug: string;
  title: string;
  body: string;
  display_order: number;
  updated_at: string;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// ---------------------------------------------------------------------------
// Helper : assertUniqueSlug
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'aucune autre ressource n'utilise ce slug. Throw une Error si
 * collision (catché par l'action appelante pour renvoyer un ActionResult).
 */
export async function assertUniqueSlug(slug: string, excludeId?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const query = supabase.from('exhibitor_resources').select('id').eq('slug', slug);
  const { data } = await query;
  const collision = (data ?? []).find((r) => r.id !== excludeId);
  if (collision) {
    throw new Error(`Le slug "${slug}" est déjà utilisé.`);
  }
}

// ---------------------------------------------------------------------------
// listResourcesAction (admin)
// ---------------------------------------------------------------------------

export async function listResourcesAction(): Promise<ActionResult<ExhibitorResourceRow[]>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('exhibitor_resources')
    .select(
      'id, slug, title_fr, title_en, body_fr, body_en, is_published, display_order, updated_at, updated_by_user_id, created_at',
    )
    .order('display_order', { ascending: true })
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('%s list-error msg=%s', LOG_PREFIX, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, data: (data ?? []) as ExhibitorResourceRow[] };
}

// ---------------------------------------------------------------------------
// getPublishedResourcesAction (anon / espace exposant)
// ---------------------------------------------------------------------------

/**
 * Liste publiée projetée par locale. Pas d'auth — RLS filtre côté DB
 * (`exhibitor_resources_read_published` ne renvoie que `is_published=true`).
 */
export async function getPublishedResourcesAction(
  locale: 'fr' | 'en',
): Promise<ActionResult<PublishedResource[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('exhibitor_resources')
    .select(
      'id, slug, title_fr, title_en, body_fr, body_en, display_order, updated_at, is_published',
    )
    .eq('is_published', true)
    .order('display_order', { ascending: true });
  if (error) {
    console.error('%s published-error msg=%s', LOG_PREFIX, error.message);
    return { ok: false, error: error.message };
  }
  const projected: PublishedResource[] = (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: locale === 'fr' ? r.title_fr : r.title_en,
    body: (locale === 'fr' ? r.body_fr : r.body_en) ?? '',
    display_order: r.display_order,
    updated_at: r.updated_at,
  }));
  return { ok: true, data: projected };
}

// ---------------------------------------------------------------------------
// upsertResourceAction
// ---------------------------------------------------------------------------

const upsertResourceSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug invalide (a-z, 0-9, tirets uniquement).'),
  title_fr: z.string().trim().min(2).max(200),
  title_en: z.string().trim().min(2).max(200),
  body_fr: z.string().trim().min(10).max(50000),
  body_en: z.string().trim().min(10).max(50000),
  is_published: z.boolean(),
  display_order: z.number().int().min(0).max(9999),
});

export type UpsertResourceInput = z.infer<typeof upsertResourceSchema>;

export async function upsertResourceAction(
  input: UpsertResourceInput,
): Promise<ActionResult<{ id: string; created: boolean }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }

  const parsed = upsertResourceSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'Validation échouée.',
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
      ),
    };
  }
  const data = parsed.data;
  const supabase = await createSupabaseServerClient();

  // Lookup état avant pour audit log + détection unicité slug
  let before: ExhibitorResourceRow | null = null;
  if (data.id) {
    const { data: existing } = await supabase
      .from('exhibitor_resources')
      .select(
        'id, slug, title_fr, title_en, body_fr, body_en, is_published, display_order, updated_at, updated_by_user_id, created_at',
      )
      .eq('id', data.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: 'Ressource introuvable.' };
    before = existing as ExhibitorResourceRow;
  }

  // Unicité slug : on check si create OR si update avec slug modifié
  if (!before || before.slug !== data.slug) {
    try {
      await assertUniqueSlug(data.slug, data.id);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Conflit slug.',
        fieldErrors: { slug: err instanceof Error ? err.message : 'Slug déjà utilisé.' },
      };
    }
  }

  const nowIso = new Date().toISOString();
  const payload = {
    slug: data.slug,
    title_fr: data.title_fr,
    title_en: data.title_en,
    body_fr: data.body_fr,
    body_en: data.body_en,
    is_published: data.is_published,
    display_order: data.display_order,
    updated_by_user_id: profile.id,
    updated_at: nowIso,
  };

  let resultId: string;
  let created: boolean;

  if (data.id) {
    const { data: updated, error } = await supabase
      .from('exhibitor_resources')
      .update(payload)
      .eq('id', data.id)
      .select('id')
      .maybeSingle();
    if (error || !updated) {
      console.error('%s update-error id=%s msg=%s', LOG_PREFIX, data.id, error?.message);
      return { ok: false, error: error?.message ?? 'Échec mise à jour.' };
    }
    resultId = updated.id;
    created = false;
  } else {
    const { data: inserted, error } = await supabase
      .from('exhibitor_resources')
      .insert(payload)
      .select('id')
      .single();
    if (error || !inserted) {
      console.error('%s insert-error slug=%s msg=%s', LOG_PREFIX, data.slug, error?.message);
      return { ok: false, error: error?.message ?? 'Échec création.' };
    }
    resultId = inserted.id;
    created = true;
  }

  // Audit log strict (best-effort)
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: created ? 'create' : 'update',
      entity_type: 'exhibitor_resources',
      entity_id: resultId,
      before: before
        ? ({
            kind: 'resource_updated',
            slug: before.slug,
            title_fr: before.title_fr,
            title_en: before.title_en,
            is_published: before.is_published,
            display_order: before.display_order,
          } as never)
        : null,
      after: {
        kind: created ? 'resource_created' : 'resource_updated',
        slug: data.slug,
        title_fr: data.title_fr,
        title_en: data.title_en,
        is_published: data.is_published,
        display_order: data.display_order,
        actor_role: profile.role,
      } as never,
    });
  } catch (auditErr) {
    console.warn(
      '%s audit-log-failed id=%s msg=%s',
      LOG_PREFIX,
      resultId,
      auditErr instanceof Error ? auditErr.message : String(auditErr),
    );
  }

  console.log(
    '%s upsert-ok id=%s slug=%s created=%s published=%s by=%s',
    LOG_PREFIX,
    resultId,
    data.slug,
    created,
    data.is_published,
    profile.id,
  );

  revalidatePath('/admin/exhibitor-resources');
  revalidatePath('/fr/espace-exposant/dashboard/ressources');
  revalidatePath('/en/espace-exposant/dashboard/ressources');
  revalidatePath(`/fr/espace-exposant/dashboard/ressources/${data.slug}`);
  revalidatePath(`/en/espace-exposant/dashboard/ressources/${data.slug}`);

  return { ok: true, data: { id: resultId, created } };
}

// ---------------------------------------------------------------------------
// deleteResourceAction
// ---------------------------------------------------------------------------

const deleteResourceSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteResourceAction(
  input: z.infer<typeof deleteResourceSchema>,
): Promise<ActionResult<{ deleted: true }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = deleteResourceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('exhibitor_resources')
    .select(
      'id, slug, title_fr, title_en, body_fr, body_en, is_published, display_order, updated_at, updated_by_user_id, created_at',
    )
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Ressource introuvable.' };

  const { error } = await supabase.from('exhibitor_resources').delete().eq('id', parsed.data.id);
  if (error) {
    console.error('%s delete-error id=%s msg=%s', LOG_PREFIX, parsed.data.id, error.message);
    return { ok: false, error: error.message };
  }

  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: 'delete',
      entity_type: 'exhibitor_resources',
      entity_id: parsed.data.id,
      before: {
        kind: 'resource_deleted',
        slug: existing.slug,
        title_fr: existing.title_fr,
        title_en: existing.title_en,
        is_published: existing.is_published,
        display_order: existing.display_order,
        actor_role: profile.role,
      } as never,
    });
  } catch (auditErr) {
    console.warn(
      '%s audit-log-failed id=%s msg=%s',
      LOG_PREFIX,
      parsed.data.id,
      auditErr instanceof Error ? auditErr.message : String(auditErr),
    );
  }

  console.log(
    '%s delete-ok id=%s slug=%s by=%s',
    LOG_PREFIX,
    parsed.data.id,
    existing.slug,
    profile.id,
  );

  revalidatePath('/admin/exhibitor-resources');
  revalidatePath('/fr/espace-exposant/dashboard/ressources');
  revalidatePath('/en/espace-exposant/dashboard/ressources');

  return { ok: true, data: { deleted: true } };
}
