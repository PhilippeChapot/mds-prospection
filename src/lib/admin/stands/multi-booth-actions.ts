'use server';

/**
 * P6.x.MultiBooths — assignation *groupée* de N stands à un prospect.
 *
 * Deux entrées :
 *   - setProspectBoothsAction : pose l'ensemble des stands d'un prospect en un
 *     appel (mode 'replace' = la liste fournie devient la liste exacte ; mode
 *     'append' = on ajoute la sélection aux stands déjà détenus).
 *   - searchProspectsForBoothAssign : autocomplete prospect pour la modale
 *     d'assignation groupée depuis le plan des emplacements.
 *
 * Découplage prix : on ne touche JAMAIS estimated_amount (cf. migration 0046 +
 * décision Phil "Decouple"). L'allocation physique est indépendante du montant
 * piloté par le QuoteBuilder.
 *
 * Atomicité : l'opération se résume à 2 UPDATE batchés (.in()) + le recalcul
 * du champ legacy booth_assignment. On reste sur le pattern supabase-js
 * séquentiel du module stands (cf. actions.ts) plutôt qu'une RPC plpgsql :
 * l'allocation est idempotente et rejouable (≠ merge_companies destructif), et
 * la logique de statut reste en TS (standStatusForProspectStatus), unit-testable.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { standStatusForProspectStatus } from './queries';
import { recomputeBoothAssignment } from './booth-helpers';
import type { ActionResult } from './actions';

const LOG_PREFIX = '[admin/stands/multi]';

const setSchema = z.object({
  prospect_id: z.string().uuid(),
  // Soft cap 20 (Phil : pas de hard cap métier, soft warning UI à 6+).
  booth_ids: z.array(z.string().uuid()).min(0).max(20),
  mode: z.enum(['replace', 'append']).default('replace'),
});

export interface SetProspectBoothsResult {
  total_count: number;
  assigned: string[];
  unassigned: string[];
}

export async function setProspectBoothsAction(
  input: z.input<typeof setSchema>,
): Promise<ActionResult<SetProspectBoothsResult>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  const { prospect_id, booth_ids, mode } = parsed.data;

  const supabase = getSupabaseServiceClient();

  // 1. Prospect + statut cible des stands.
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, status')
    .eq('id', prospect_id)
    .maybeSingle();
  if (pErr || !prospect) return { ok: false, error: 'Prospect introuvable.' };

  // 2. Stands actuellement détenus par ce prospect.
  const { data: currentRows } = await supabase
    .from('stands')
    .select('id, number')
    .eq('prospect_id', prospect_id);
  const currentIds = new Set((currentRows ?? []).map((r) => r.id));
  const numberById = new Map<string, string>();
  for (const r of currentRows ?? []) numberById.set(r.id, r.number);

  // 3. Validation des stands demandés (disponibles ou déjà à ce prospect).
  if (booth_ids.length > 0) {
    const { data: targetRows, error: tErr } = await supabase
      .from('stands')
      .select('id, number, status, prospect_id')
      .in('id', booth_ids);
    if (tErr) return { ok: false, error: tErr.message };
    if (!targetRows || targetRows.length !== booth_ids.length) {
      return { ok: false, error: 'Un ou plusieurs stands sont introuvables.' };
    }
    for (const s of targetRows) {
      numberById.set(s.id, s.number);
      if (s.status === 'bloque') {
        return { ok: false, error: `Le stand ${s.number} est bloqué (hors-vente).` };
      }
      if (s.prospect_id && s.prospect_id !== prospect_id) {
        return { ok: false, error: `Le stand ${s.number} est déjà assigné à un autre prospect.` };
      }
    }
  }

  // 4. Statut cible. On bloque l'ASSIGNATION sur un prospect perdu, mais on
  // autorise toujours le retrait total (booth_ids vide en mode replace).
  const computed = standStatusForProspectStatus(prospect.status);
  if (computed === 'release' && booth_ids.length > 0) {
    return {
      ok: false,
      error: "Impossible d'assigner un stand à un prospect 'perdu'. Réactivez-le d'abord.",
    };
  }
  const newStatus = computed === 'release' ? 'libre' : computed;

  // 5. Diff. En 'append' on ne retire jamais ; en 'replace' la liste fournie
  // devient la liste exacte (les stands absents sont libérés).
  const newIds = new Set(booth_ids);
  const toUnassign = mode === 'append' ? [] : [...currentIds].filter((id) => !newIds.has(id));
  const finalIds = mode === 'append' ? new Set([...currentIds, ...newIds]) : newIds;

  const now = new Date().toISOString();

  // 6. Libère les stands retirés (mode replace uniquement).
  if (toUnassign.length > 0) {
    const { error } = await supabase
      .from('stands')
      .update({ prospect_id: null, status: 'libre', updated_at: now })
      .in('id', toUnassign);
    if (error) {
      console.error(
        '%s unassign-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect_id,
        error.message,
      );
      return { ok: false, error: error.message };
    }
  }

  // 7. Assigne / rafraîchit le statut des stands demandés.
  if (booth_ids.length > 0 && newStatus !== 'libre') {
    const { error } = await supabase
      .from('stands')
      .update({ prospect_id, status: newStatus, updated_at: now })
      .in('id', booth_ids);
    if (error) {
      console.error('%s assign-failed prospect=%s msg=%s', LOG_PREFIX, prospect_id, error.message);
      return { ok: false, error: error.message };
    }
  }

  // 8. Recalcul booth_assignment (legacy, rétrocompat espace-partenaire).
  const boothAssignment = await recomputeBoothAssignment(supabase, prospect_id);
  await supabase
    .from('prospects')
    .update(
      boothAssignment
        ? {
            booth_assignment: boothAssignment,
            booth_assigned_at: now,
            booth_assigned_by: profile.id,
            last_activity_at: now,
          }
        : {
            booth_assignment: null,
            booth_assigned_at: null,
            booth_assigned_by: null,
            last_activity_at: now,
          },
    )
    .eq('id', prospect_id);

  // 9. Audit log → timeline auto-entry "X blocs assignés" (P14.4).
  const assigned = booth_ids.filter((id) => !currentIds.has(id));
  const finalNumbers = [...finalIds]
    .map((id) => numberById.get(id))
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'prospects',
    entity_id: prospect_id,
    action: 'update',
    after: {
      kind: 'prospect_booths_changed',
      assigned,
      unassigned: toUnassign,
      total_count: finalIds.size,
      stand_numbers: finalNumbers,
    },
  });

  console.log(
    '%s set prospect=%s mode=%s total=%d assigned=%d unassigned=%d',
    LOG_PREFIX,
    prospect_id,
    mode,
    finalIds.size,
    assigned.length,
    toUnassign.length,
  );

  revalidatePath(`/admin/prospects/${prospect_id}`);
  revalidatePath('/admin/emplacements');
  return {
    ok: true,
    data: { total_count: finalIds.size, assigned, unassigned: toUnassign },
  };
}

// ---------------------------------------------------------------------------
// Autocomplete prospect pour la modale d'assignation groupée (plan emplacements)
// ---------------------------------------------------------------------------

const searchSchema = z.object({ query: z.string().trim().max(120) });

export interface ProspectSearchHit {
  id: string;
  company_name: string;
  status: string;
}

export async function searchProspectsForBoothAssign(
  input: z.infer<typeof searchSchema>,
): Promise<ActionResult<ProspectSearchHit[]>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const q = parsed.data.query;
  if (q.length < 2) return { ok: true, data: [] };

  const supabase = getSupabaseServiceClient();
  // Filtre sur le nom de société (jointure) : on récupère un lot puis on
  // filtre en mémoire (case+accent via includes lower) pour rester tolérant.
  const { data, error } = await supabase
    .from('prospects')
    .select('id, status, company:companies(name)')
    .eq('is_test', false)
    .not('status', 'eq', 'perdu')
    .limit(200);
  if (error) {
    console.warn('%s search-failed msg=%s', LOG_PREFIX, error.message);
    return { ok: false, error: error.message };
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const needle = q.toLowerCase();
  const hits: ProspectSearchHit[] = [];
  for (const r of data ?? []) {
    const name = pickOne(
      r.company as { name: string | null } | { name: string | null }[] | null,
    )?.name;
    if (!name) continue;
    if (!name.toLowerCase().includes(needle)) continue;
    hits.push({ id: r.id, company_name: name, status: r.status });
    if (hits.length >= 12) break;
  }
  return { ok: true, data: hits };
}
