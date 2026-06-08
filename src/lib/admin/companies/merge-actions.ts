'use server';

/**
 * P5.x.CompanyMerge — server actions de fusion de sociétés (doublons).
 *
 * Cas d'usage Phil : fusionner "WinMedia" + "Win-Group Software SAS" →
 * garder la cible, déplacer prospects/contacts/notes/calendrier/audit,
 * supprimer la source.
 *
 * RBAC : super_admin UNIQUEMENT (action destructive irréversible) —
 * doctrine [[feedback_super_admin_destructive_actions_pattern]].
 *
 * Atomicité : le merge réel est délégué à la RPC plpgsql
 * `public.merge_companies` (transaction Postgres tout-ou-rien). Voir
 * migration 0087. Ici on se contente de : garder RBAC + Zod + appel RPC +
 * revalidate. L'audit_log est écrit DANS la RPC (atomique avec le merge).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n'exporte QUE des async functions.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { searchCompaniesFuzzy } from '@/lib/admin/search/fuzzy-search';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ─── Search cible (autocomplete picker dans le dialog de fusion) ──────

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  exclude_id: z.string().uuid(),
});

export type MergeTargetLite = { id: string; name: string };

/**
 * Cherche des sociétés candidates comme CIBLE de fusion, en excluant la
 * source (on ne fusionne pas une société avec elle-même). Réutilise le
 * fuzzy search admin existant.
 */
export async function searchMergeTargetsAction(
  input: z.input<typeof searchSchema>,
): Promise<MergeTargetLite[]> {
  try {
    await requireSuperAdmin();
  } catch {
    return [];
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];

  const { exact, suggestions } = await searchCompaniesFuzzy(parsed.data.q, {
    limitExact: 10,
    limitFuzzy: 5,
  });
  const seen = new Set<string>([parsed.data.exclude_id]);
  const out: MergeTargetLite[] = [];
  for (const s of [...exact, ...suggestions]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, name: s.label });
    if (out.length >= 10) break;
  }
  return out;
}

// ─── Preview impact (avant confirmation) ──────────────────────────────

const previewSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
});

export type MergeImpact = {
  source: { id: string; name: string; sellsy_id: string | null; siren: string | null };
  target: { id: string; name: string; sellsy_id: string | null; siren: string | null };
  counts: {
    prospects: number;
    contacts: number;
    reminders: number;
    affiliate_claims: number;
  };
  /** La cible héritera du sellsy_id de la source (cible vide + source pleine). */
  sellsy_backfill: boolean;
  /** La cible héritera du siren de la source. */
  siren_backfill: boolean;
};

/**
 * Calcule l'impact de la fusion source→cible pour l'écran de confirmation.
 * Lecture seule. Compte les enfants clés de la source + détecte les
 * backfills (sellsy_id / siren) qui seront appliqués à la cible.
 */
export async function previewMergeImpactAction(
  input: z.input<typeof previewSchema>,
): Promise<ActionResult<MergeImpact>> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  if (parsed.data.source_id === parsed.data.target_id) {
    return { ok: false, error: 'Source et cible identiques.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  const [{ data: source }, { data: target }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, sellsy_id, siren')
      .eq('id', parsed.data.source_id)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('id, name, sellsy_id, siren')
      .eq('id', parsed.data.target_id)
      .maybeSingle(),
  ]);
  if (!source) return { ok: false, error: 'Société source introuvable.' };
  if (!target) return { ok: false, error: 'Société cible introuvable.' };

  const countFor = async (table: string, column: string): Promise<number> => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, parsed.data.source_id);
    return count ?? 0;
  };

  const [prospects, contacts, reminders, affiliateClaims] = await Promise.all([
    countFor('prospects', 'company_id'),
    countFor('contacts', 'company_id'),
    countFor('reminders', 'company_id'),
    countFor('affiliate_claims', 'company_id'),
  ]);

  return {
    ok: true,
    data: {
      source: {
        id: source.id,
        name: source.name,
        sellsy_id: source.sellsy_id ?? null,
        siren: source.siren ?? null,
      },
      target: {
        id: target.id,
        name: target.name,
        sellsy_id: target.sellsy_id ?? null,
        siren: target.siren ?? null,
      },
      counts: { prospects, contacts, reminders, affiliate_claims: affiliateClaims },
      sellsy_backfill: !target.sellsy_id && !!source.sellsy_id,
      siren_backfill: !target.siren && !!source.siren,
    },
  };
}

// ─── Merge (action destructive, super_admin only) ─────────────────────

const mergeSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  confirmation: z.literal('FUSIONNER'),
});

export type MergeResult = {
  source_name: string;
  target_name: string;
  moved: Record<string, number>;
};

/**
 * Fusionne la société source DANS la cible puis supprime la source.
 * Délègue à la RPC atomique `merge_companies` (rollback si erreur).
 * Réservé super_admin. Confirmation "FUSIONNER" obligatoire (anti-clic).
 */
export async function mergeCompaniesAction(
  input: z.input<typeof mergeSchema>,
): Promise<ActionResult<MergeResult>> {
  let actorId: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Réservé aux super_admin.' };
  }

  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  if (parsed.data.source_id === parsed.data.target_id) {
    return { ok: false, error: 'Impossible de fusionner une société avec elle-même.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const { data, error } = await supabase.rpc('merge_companies', {
    p_source_id: parsed.data.source_id,
    p_target_id: parsed.data.target_id,
    p_actor_id: actorId,
  });

  if (error) {
    const map: Record<string, string> = {
      SOURCE_EQUALS_TARGET: 'Source et cible identiques.',
      SOURCE_NOT_FOUND: 'Société source introuvable.',
      TARGET_NOT_FOUND: 'Société cible introuvable.',
    };
    const matched = Object.keys(map).find((k) => error.message?.includes(k));
    return { ok: false, error: matched ? map[matched] : error.message };
  }

  const result = (data ?? {}) as Record<string, number> & {
    source_name?: string;
    target_name?: string;
  };

  console.warn(
    '[P5.x.CompanyMerge] merged source=%s into target=%s by=%s',
    parsed.data.source_id,
    parsed.data.target_id,
    actorId,
  );

  revalidatePath('/admin/companies');
  revalidatePath(`/admin/companies/${parsed.data.target_id}`);

  const { source_name, target_name, ...moved } = result;
  return {
    ok: true,
    data: {
      source_name: source_name ?? '',
      target_name: target_name ?? '',
      moved: moved as Record<string, number>,
    },
  };
}
