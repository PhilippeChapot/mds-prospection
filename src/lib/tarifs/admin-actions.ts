'use server';

/**
 * P6.x.1a — server actions pour le module /admin/tarifs.
 *
 * Toutes les actions :
 *   - exigent hasAdminAccess(profile.role) (les sales ne peuvent pas modifier la
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
import { classifyByReference } from './auto-classify';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import {
  upsertEditorialSchema,
  deleteEditorialSchema,
  autoClassifySchema,
  type ActionResult,
  type AutoClassifyResult,
  type AutoClassifyPreviewItem,
} from './admin-actions-schema';

const LOG_PREFIX = '[admin/tarifs]';

export async function upsertEditorialAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
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
  if (!hasAdminAccess(profile.role)) {
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
  if (!hasAdminAccess(profile.role)) {
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

/**
 * P6.x.1a-quater — auto-classification regex en masse.
 *
 * Pour chaque produit Sellsy non archivé :
 *   1. Calcule la classification via classifyByReference(reference)
 *   2. Si pas de match → skip (compte unmatched)
 *   3. Si déjà classifié en autre chose que 'autre' ET override=false → skip
 *   4. Sinon → upsert en DB (catégorie + sous-catégorie)
 *
 * Modes :
 *   - dry_run=true → calcule le preview sans toucher la DB. Permet à Phil
 *     de vérifier avant d'appliquer.
 *   - override_existing=true → réécrit même les classifs manuelles
 *     (catégorie != 'autre'). UX : checkbox dans la modale de confirm.
 */
export async function autoClassifyAllAction(
  input: unknown,
): Promise<ActionResult<AutoClassifyResult>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = autoClassifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const { override_existing, dry_run } = parsed.data;

  const supabase = getSupabaseServiceClient();

  const [{ data: products, error: pErr }, { data: editorials, error: eErr }] = await Promise.all([
    supabase
      .from('sellsy_products_mirror')
      .select('sellsy_item_id, reference, name')
      .eq('is_archived', false),
    supabase.from('tariff_editorial').select('sellsy_product_id, category, sub_category'),
  ]);
  if (pErr) return { ok: false, error: pErr.message };
  if (eErr) return { ok: false, error: eErr.message };

  const editorialByPid = new Map<number, { category: string; sub_category: string | null }>(
    (editorials ?? []).map((e) => [
      Number(e.sellsy_product_id),
      { category: e.category, sub_category: e.sub_category ?? null },
    ]),
  );

  const preview: AutoClassifyPreviewItem[] = [];
  let classified = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const product of products ?? []) {
    const classification = classifyByReference(product.reference);
    if (!classification) {
      unmatched += 1;
      continue;
    }
    const existing = editorialByPid.get(Number(product.sellsy_item_id));
    // Skip si déjà classifié en autre chose que 'autre' ET override=false
    if (existing && existing.category !== 'autre' && !override_existing) {
      skipped += 1;
      continue;
    }
    preview.push({
      sellsy_product_id: Number(product.sellsy_item_id),
      reference: product.reference,
      name: product.name ?? null,
      current_category: existing?.category ?? null,
      current_sub_category: existing?.sub_category ?? null,
      new_category: classification.category,
      new_sub_category: classification.sub_category,
      matched_pattern: classification.matched_pattern,
      label: classification.label,
      confidence: classification.confidence,
    });
    classified += 1;
  }

  if (!dry_run && preview.length > 0) {
    // Upsert en batch. On préserve les autres colonnes éditoriales en upsert
    // partiel : seulement category/sub_category/updated_at. Les nouveaux INSERT
    // récupèrent les defaults SQL (display_order=9999, featured=false, etc.).
    const rows = preview.map((item) => ({
      sellsy_product_id: item.sellsy_product_id,
      category: item.new_category,
      sub_category: item.new_sub_category,
      updated_at: new Date().toISOString(),
    }));
    // Supabase upsert avec ignoreDuplicates=false écrase tout. Pour ne pas
    // toucher aux colonnes éditoriales riches, on fait 2 paths :
    //   - nouvelles lignes (existing absent) → INSERT
    //   - lignes existantes → UPDATE ciblé
    const newPids = new Set<number>();
    for (const p of preview) {
      if (!editorialByPid.has(p.sellsy_product_id)) newPids.add(p.sellsy_product_id);
    }

    if (newPids.size > 0) {
      const insertRows = rows.filter((r) => newPids.has(r.sellsy_product_id));
      const { error: insErr } = await supabase.from('tariff_editorial').insert(insertRows);
      if (insErr) return { ok: false, error: `insert: ${insErr.message}` };
    }

    const updateRows = rows.filter((r) => !newPids.has(r.sellsy_product_id));
    for (const row of updateRows) {
      const { error: updErr } = await supabase
        .from('tariff_editorial')
        .update({
          category: row.category,
          sub_category: row.sub_category,
          updated_at: row.updated_at,
        })
        .eq('sellsy_product_id', row.sellsy_product_id);
      if (updErr) return { ok: false, error: `update ${row.sellsy_product_id}: ${updErr.message}` };
    }

    revalidatePath('/admin/tarifs');
  }

  console.log(
    '%s auto-classify dry_run=%s override=%s classified=%d skipped=%d unmatched=%d by=%s',
    LOG_PREFIX,
    dry_run,
    override_existing,
    classified,
    skipped,
    unmatched,
    profile.email,
  );

  return {
    ok: true,
    data: {
      classified,
      skipped,
      unmatched,
      preview,
      dry_run,
      override_existing,
    },
  };
}
