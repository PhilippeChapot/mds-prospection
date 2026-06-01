'use server';

/**
 * P5.x.ExternalEvents — server actions pour l arbitrage UI review.
 *
 * 3 actions principales :
 *   - mergeUnverifiedCompanyAction({ unverifiedId, targetCompanyId })
 *     transfere les external_event_tags + tous les contacts de la company
 *     unverified vers la target existante, puis delete unverified.
 *   - validateUnverifiedCompanyAction({ unverifiedId })
 *     passe le statut a 'verified' (= la company est OK telle quelle).
 *   - ignoreUnverifiedCompanyAction({ unverifiedId })
 *     soft-delete : status='ignored' + delete contacts lies (import_*).
 *
 * RBAC : super_admin pour ignore, admin/super_admin pour merge/validate.
 * Doctrine [[feedback_super_admin_destructive_actions_pattern]].
 *
 * + suggestMatchesForUnverifiedAction : retourne top 3 companies non
 * unverified avec score > 0.7 (Levenshtein normalize).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { similarityScore } from '@/lib/external-events/normalize';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const idSchema = z.object({ unverifiedId: z.string().uuid() });

export async function validateUnverifiedCompanyAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Donnees invalides.' };
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Reserve aux admins.' };

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('companies')
    .update({ external_events_review_status: 'verified' })
    .eq('id', parsed.data.unverifiedId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/external-events-review');
  return { ok: true };
}

export async function ignoreUnverifiedCompanyAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Donnees invalides.' };
  const profile = await requireAdminProfile();
  if (profile.role !== 'super_admin') {
    return { ok: false, error: 'Reserve aux super-admins.' };
  }
  const supabase = getSupabaseServiceClient();

  // Delete contacts importes pour cette company (import_md_classic/rde/satis/cbd)
  await supabase
    .from('contacts')
    .delete()
    .eq('company_id', parsed.data.unverifiedId)
    .in('import_source', ['import_md_classic', 'import_rde', 'import_satis', 'import_cbd']);

  const { error } = await supabase
    .from('companies')
    .update({ external_events_review_status: 'ignored' })
    .eq('id', parsed.data.unverifiedId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/external-events-review');
  return { ok: true };
}

const mergeSchema = z.object({
  unverifiedId: z.string().uuid(),
  targetCompanyId: z.string().uuid(),
});

export async function mergeUnverifiedCompanyAction(
  input: z.input<typeof mergeSchema>,
): Promise<ActionResult> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Donnees invalides.' };
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Reserve aux admins.' };
  if (parsed.data.unverifiedId === parsed.data.targetCompanyId) {
    return { ok: false, error: 'Source et cible identiques.' };
  }

  const supabase = getSupabaseServiceClient();

  // 1. Read unverified.
  const { data: src } = await supabase
    .from('companies')
    .select('id, external_event_tags, external_events_review_status')
    .eq('id', parsed.data.unverifiedId)
    .maybeSingle();
  if (!src) return { ok: false, error: 'Company source introuvable.' };
  if (src.external_events_review_status !== 'unverified') {
    return { ok: false, error: 'Company source n est pas unverified.' };
  }

  // 2. Read target.
  const { data: target } = await supabase
    .from('companies')
    .select('id, external_event_tags')
    .eq('id', parsed.data.targetCompanyId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Company cible introuvable.' };

  // 3. Merge tags : srcTags + targetTags (years deduplicated per key).
  const srcTags = (src.external_event_tags ?? {}) as Record<string, unknown>;
  const targetTags = (target.external_event_tags ?? {}) as Record<string, unknown>;
  const nextTags: Record<string, number[]> = {};
  const allKeys = new Set([...Object.keys(srcTags), ...Object.keys(targetTags)]);
  for (const key of allKeys) {
    const a = Array.isArray(srcTags[key]) ? (srcTags[key] as unknown[]) : [];
    const b = Array.isArray(targetTags[key]) ? (targetTags[key] as unknown[]) : [];
    const merged = Array.from(
      new Set(
        [...a, ...b]
          .map((v) => (typeof v === 'number' ? v : Number(v)))
          .filter((y) => Number.isFinite(y)),
      ),
    ).sort((x, y) => x - y);
    if (merged.length > 0) nextTags[key] = merged;
  }

  // 4. Move contacts of unverified -> target.
  await supabase.from('contacts').update({ company_id: target.id }).eq('company_id', src.id);

  // 5. Update target tags + mark unverified as merged.
  await supabase.from('companies').update({ external_event_tags: nextTags }).eq('id', target.id);
  await supabase
    .from('companies')
    .update({ external_events_review_status: 'merged' })
    .eq('id', src.id);

  revalidatePath('/admin/external-events-review');
  revalidatePath(`/admin/companies/${target.id}`);
  return { ok: true };
}

const suggestSchema = z.object({ unverifiedId: z.string().uuid() });

export async function suggestMatchesForUnverifiedAction(
  input: z.input<typeof suggestSchema>,
): Promise<
  | { ok: true; suggestions: Array<{ id: string; name: string; score: number }> }
  | { ok: false; error: string }
> {
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Donnees invalides.' };
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Reserve aux admins.' };

  const supabase = getSupabaseServiceClient();

  const { data: src } = await supabase
    .from('companies')
    .select('id, name_normalized')
    .eq('id', parsed.data.unverifiedId)
    .maybeSingle();
  if (!src) return { ok: false, error: 'Source introuvable.' };

  // On charge tous les noms normalises non-unverified (limit 2000 raisonnable
  // pour la base actuelle ~1500 companies). Pour scale on basculera sur
  // pg_trgm similarity().
  const { data: candidates } = await supabase
    .from('companies')
    .select('id, name, name_normalized')
    .neq('id', src.id)
    .is('external_events_review_status', null)
    .limit(2000);

  const scored = (candidates ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      score: similarityScore(src.name_normalized, c.name_normalized),
    }))
    .filter((c) => c.score >= 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { ok: true, suggestions: scored };
}
