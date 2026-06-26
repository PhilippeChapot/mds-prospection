'use server';

/**
 * P5.x.ReassignContactsToCompany — server actions pour déplacer 1..N contacts
 * d'une société vers une autre.
 *
 *   - searchTargetCompaniesAction : autocomplete société destination (nom/
 *     domaine), enrichi domaine + pays + nb contacts, en excluant la société
 *     courante (évite le no-op « déplacer vers la même »).
 *   - reassignContactsToCompanyAction : valide RBAC + skip no-op + garde-fou
 *     domain mismatch (warning forçable) puis délègue à la RPC atomique
 *     `reassign_contacts_to_company` (migration 0111).
 *
 * RBAC : hasAdminAccess (admin/super_admin) — pas 'sales'. Action sensible
 * mais réversible → pas de requireSuperAdmin (≠ merge/delete irréversibles).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n'exporte QUE des async functions (les helpers purs vivent
 * dans contact-reassign-helpers.ts).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { searchCompaniesFuzzy } from '@/lib/admin/search/fuzzy-search';
import { detectDomainMismatch } from './contact-reassign-helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ─── Autocomplete société destination ─────────────────────────────────

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  exclude_company_id: z.string().uuid(),
});

export type TargetCompanyLite = {
  id: string;
  name: string;
  primary_domain: string | null;
  country: string | null;
  contact_count: number;
};

export async function searchTargetCompaniesAction(
  input: z.input<typeof searchSchema>,
): Promise<TargetCompanyLite[]> {
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role)) return [];
  } catch {
    return [];
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];

  // Réutilise le fuzzy search admin (normalisation case+accent insensible,
  // [[feedback_normalize_name_for_matching]]) pour les candidats, puis enrichit.
  const { exact, suggestions } = await searchCompaniesFuzzy(parsed.data.q, {
    limitExact: 8,
    limitFuzzy: 5,
  });

  const ids: string[] = [];
  const seen = new Set<string>([parsed.data.exclude_company_id]);
  for (const s of [...exact, ...suggestions]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    ids.push(s.id);
    if (ids.length >= 5) break;
  }
  if (ids.length === 0) return [];

  const supabase = getSupabaseServiceClient() as AnyDb;
  const [{ data: companies }, { data: contactRows }] = await Promise.all([
    supabase.from('companies').select('id, name, primary_domain, country').in('id', ids),
    supabase.from('contacts').select('company_id').in('company_id', ids),
  ]);

  const counts = new Map<string, number>();
  for (const row of (contactRows ?? []) as Array<{ company_id: string }>) {
    counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
  }

  const byId = new Map<
    string,
    { name: string; primary_domain: string | null; country: string | null }
  >();
  for (const c of (companies ?? []) as Array<{
    id: string;
    name: string;
    primary_domain: string | null;
    country: string | null;
  }>) {
    byId.set(c.id, { name: c.name, primary_domain: c.primary_domain, country: c.country });
  }

  // Conserve l'ordre de pertinence du fuzzy search.
  return ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const c = byId.get(id)!;
      return {
        id,
        name: c.name,
        primary_domain: c.primary_domain,
        country: c.country,
        contact_count: counts.get(id) ?? 0,
      };
    });
}

// ─── Réaffectation (batch) ─────────────────────────────────────────────

const reassignSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
  target_company_id: z.string().uuid(),
  force_domain_mismatch: z.boolean().default(false),
});

export type ReassignMismatch = {
  contact_id: string;
  email: string | null;
  contact_domain: string | null;
};

export type ReassignResult =
  | {
      ok: true;
      moved_contacts: number;
      moved_prospects: number;
      target_name: string;
    }
  | {
      ok: false;
      error: string;
      reason?: 'domain_mismatch';
      mismatches?: ReassignMismatch[];
    };

export async function reassignContactsToCompanyAction(
  input: z.input<typeof reassignSchema>,
): Promise<ReassignResult> {
  let actorId: string;
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role)) {
      return { ok: false, error: 'Réservé aux administrateurs.' };
    }
    actorId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }

  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }
  const { target_company_id, force_domain_mismatch } = parsed.data;

  const supabase = getSupabaseServiceClient() as AnyDb;

  // 1. Société cible (existence + domaine pour le garde-fou).
  const { data: target } = await supabase
    .from('companies')
    .select('id, name, primary_domain')
    .eq('id', target_company_id)
    .maybeSingle();
  if (!target) {
    return { ok: false, error: 'Société de destination introuvable.' };
  }

  // 2. Contacts demandés (existence + société actuelle + email).
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, company_id')
    .in('id', parsed.data.contact_ids);
  const contactRows = (contacts ?? []) as Array<{
    id: string;
    email: string | null;
    company_id: string;
  }>;
  if (contactRows.length === 0) {
    return { ok: false, error: 'Aucun contact valide à déplacer.' };
  }

  // 3. Skip no-op : contacts déjà sur la cible.
  const toMove = contactRows.filter((c) => c.company_id !== target_company_id);
  if (toMove.length === 0) {
    return {
      ok: false,
      error: 'Les contacts sélectionnés sont déjà rattachés à cette société.',
    };
  }

  // 4. Garde-fou domain mismatch (sauf si forcé).
  if (!force_domain_mismatch) {
    const mismatches: ReassignMismatch[] = toMove
      .filter((c) => detectDomainMismatch(c.email, target.primary_domain))
      .map((c) => ({
        contact_id: c.id,
        email: c.email,
        contact_domain: c.email ? (c.email.split('@')[1]?.toLowerCase() ?? null) : null,
      }));
    if (mismatches.length > 0) {
      return {
        ok: false,
        reason: 'domain_mismatch',
        error: `Domaine email incohérent pour ${mismatches.length} contact(s).`,
        mismatches,
      };
    }
  }

  // Sociétés d'origine (pour revalider les fiches concernées).
  const sourceCompanyIds = Array.from(new Set(toMove.map((c) => c.company_id)));
  const moveIds = toMove.map((c) => c.id);

  // 5. RPC atomique.
  const { data, error } = await supabase.rpc('reassign_contacts_to_company', {
    p_contact_ids: moveIds,
    p_target_company_id: target_company_id,
    p_actor_id: actorId,
  });

  if (error) {
    const map: Record<string, string> = {
      NO_CONTACTS: 'Aucun contact à déplacer.',
      TARGET_NOT_FOUND: 'Société de destination introuvable.',
    };
    const matched = Object.keys(map).find((k) => error.message?.includes(k));
    return { ok: false, error: matched ? map[matched] : error.message };
  }

  const result = (data ?? {}) as {
    moved_contacts?: number;
    moved_prospects?: number;
    target_name?: string;
  };

  console.warn(
    '[P5.x.ReassignContacts] moved %d contact(s) to target=%s by=%s',
    moveIds.length,
    target_company_id,
    actorId,
  );

  // 6. Revalidation : fiches source + cible.
  revalidatePath('/admin/companies');
  for (const sid of sourceCompanyIds) revalidatePath(`/admin/companies/${sid}`);
  revalidatePath(`/admin/companies/${target_company_id}`);

  return {
    ok: true,
    moved_contacts: result.moved_contacts ?? moveIds.length,
    moved_prospects: result.moved_prospects ?? 0,
    target_name: result.target_name ?? target.name,
  };
}
