'use server';

/**
 * P6.x.1a — server actions pour le module /admin/tarifs.
 *
 * Toutes les actions :
 *   - exigent profile.role === 'admin' (les sales ne peuvent pas modifier la
 *     couche éditoriale, c'est du contenu marketing géré par Phil)
 *   - utilisent le service-role client (bypass RLS, propre + prévisible)
 *   - revalidatePath('/admin/tarifs') à la fin
 *
 * Next.js 15 strict mode : ce fichier ne peut exporter QUE des fonctions
 * async. Les schemas Zod + types sont dans `./admin-actions-schema.ts`.
 */

import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  upsertEditorialSchema,
  deleteEditorialSchema,
  type ActionResult,
} from './admin-actions-schema';

const LOG_PREFIX = '[admin/tarifs]';

export async function upsertEditorialAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = upsertEditorialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('tariff_editorial')
    .upsert(
      {
        sellsy_product_id: data.sellsy_product_id,
        category: data.category,
        sub_category: data.sub_category ?? null,
        display_order: data.display_order,
        featured: data.featured,
        editorial_title: data.editorial_title ?? null,
        tagline: data.tagline ?? null,
        description_md: data.description_md ?? null,
        image_url: data.image_url ? data.image_url : null,
        tags: data.tags,
        target_audience: data.target_audience ?? null,
        value_proposition: data.value_proposition ?? null,
        is_visible_public: data.is_visible_public,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sellsy_product_id' },
    )
    .select('id')
    .single();

  if (error || !row) {
    console.error(
      '%s upsert-failed sellsy=%s msg=%s',
      LOG_PREFIX,
      data.sellsy_product_id,
      error?.message,
    );
    return { ok: false, error: error?.message ?? 'Upsert failed' };
  }

  console.log(
    '%s upserted sellsy=%s category=%s order=%d featured=%s by=%s',
    LOG_PREFIX,
    data.sellsy_product_id,
    data.category,
    data.display_order,
    data.featured,
    profile.email,
  );

  revalidatePath('/admin/tarifs');
  return { ok: true, data: { id: row.id } };
}

export async function deleteEditorialAction(input: unknown): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = deleteEditorialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation' };
  }
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('tariff_editorial')
    .delete()
    .eq('sellsy_product_id', parsed.data.sellsy_product_id);
  if (error) return { ok: false, error: error.message };

  console.log('%s reset sellsy=%s by=%s', LOG_PREFIX, parsed.data.sellsy_product_id, profile.email);
  revalidatePath('/admin/tarifs');
  return { ok: true };
}

/**
 * Bootstrap rapide : pour chaque produit Sellsy (non archivé) qui n'a pas
 * de ligne tariff_editorial, on INSERT une ligne 'autre' par défaut.
 * Permet à Phil d'avoir une base de travail puis taggue/réorganise.
 */
export async function bulkInitOtherAction(): Promise<
  ActionResult<{ inserted: number; total: number }>
> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: products, error: pErr } = await supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id')
    .eq('is_archived', false);
  if (pErr) return { ok: false, error: pErr.message };

  const { data: existing, error: eErr } = await supabase
    .from('tariff_editorial')
    .select('sellsy_product_id');
  if (eErr) return { ok: false, error: eErr.message };

  const existingSet = new Set((existing ?? []).map((e) => Number(e.sellsy_product_id)));
  const toInsert = (products ?? [])
    .map((p) => Number(p.sellsy_item_id))
    .filter((id) => !existingSet.has(id));

  if (toInsert.length === 0) {
    return { ok: true, data: { inserted: 0, total: products?.length ?? 0 } };
  }

  const rows = toInsert.map((sellsy_product_id) => ({
    sellsy_product_id,
    category: 'autre' as const,
    display_order: 9999,
    featured: false,
    is_visible_public: true,
    tags: [] as string[],
  }));

  const { error: insertErr } = await supabase.from('tariff_editorial').insert(rows);
  if (insertErr) return { ok: false, error: insertErr.message };

  console.log('%s bulk-init-other inserted=%d by=%s', LOG_PREFIX, toInsert.length, profile.email);
  revalidatePath('/admin/tarifs');
  return { ok: true, data: { inserted: toInsert.length, total: products?.length ?? 0 } };
}
