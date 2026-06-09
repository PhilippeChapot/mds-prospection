'use server';

/**
 * P7.x.AffiliateManualCompanyAttach — server actions super_admin.
 *
 * Permet à un super_admin d'attacher/détacher manuellement une société à un
 * affilié (claim source='manual_admin'), hors des 3 sources automatiques
 * (cookie / declared_by_company / declared_by_affiliate). Utile pour rattraper
 * une attribution loupée (ex: l'affilié a démarché une société mais le cookie
 * tracking n'a pas pris).
 *
 * 3 actions :
 *   - attachCompanyToAffiliateAction   : crée un claim active source='manual_admin'.
 *   - detachCompanyFromAffiliateAction : supprime un claim (DELETE + audit).
 *   - searchAvailableCompaniesAction   : recherche fuzzy (réutilise la RPC
 *       search_companies_fuzzy P5.x.SearchFuzzy) + annote les sociétés déjà
 *       attribuées (claim actif) pour les griser côté UI.
 *
 * Toutes super_admin only (doctrine super_admin_destructive_actions_pattern,
 * 4 couches : requireSuperAdmin throw → zod → audit strict → console.warn).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[affiliate-claims/manual-attach]';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// attachCompanyToAffiliateAction (super_admin)
// ---------------------------------------------------------------------------

const attachSchema = z.object({
  affiliate_id: z.string().uuid(),
  company_id: z.string().uuid(),
  notes_admin: z.string().trim().max(2000).optional(),
});

export async function attachCompanyToAffiliateAction(
  input: z.infer<typeof attachSchema>,
): Promise<ActionResult<{ claimId: string }>> {
  let actorId: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const { affiliate_id, company_id, notes_admin } = parsed.data;
  const supabase = getSupabaseServiceClient();

  // 1. Affilié + société existent.
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, display_name')
    .eq('id', affiliate_id)
    .maybeSingle();
  if (!affiliate) return { ok: false, error: 'Affilié introuvable.' };

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', company_id)
    .maybeSingle();
  if (!company) return { ok: false, error: 'Société introuvable.' };

  // 2. Pas de claim ACTIF sur cette société par un AUTRE affilié (anti
  //    double-attribution — une société = un affilié).
  const { data: conflicting } = await supabase
    .from('affiliate_claims')
    .select('id, affiliate_id')
    .eq('company_id', company_id)
    .eq('status', 'active')
    .neq('affiliate_id', affiliate_id)
    .maybeSingle();
  if (conflicting) {
    return {
      ok: false,
      error: 'Cette société est déjà attribuée à un autre affilié (claim actif).',
    };
  }

  // 3. Pas déjà un claim sur cette paire (affilié, société) — la contrainte
  //    UNIQUE (affiliate_id, company_id) bloquerait, on retourne un message clair.
  const { data: existing } = await supabase
    .from('affiliate_claims')
    .select('id, status')
    .eq('affiliate_id', affiliate_id)
    .eq('company_id', company_id)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `Un claim existe déjà sur cette paire (statut : ${existing.status}). Gérez-le via la page Claims.`,
    };
  }

  // 4. Insert claim active source='manual_admin'.
  const now = new Date().toISOString();
  const { data: claim, error: insErr } = await supabase
    .from('affiliate_claims')
    .insert({
      affiliate_id,
      company_id,
      declared_company_name: company.name,
      source: 'manual_admin',
      status: 'active',
      validated_at: now,
      validated_by: actorId,
      notes_admin: notes_admin ?? null,
    })
    .select('id')
    .single();
  if (insErr || !claim) {
    console.error('%s attach-insert-failed msg=%s', LOG_PREFIX, insErr?.message ?? 'unknown');
    return { ok: false, error: insErr?.message ?? 'Échec attachement.' };
  }

  // 5. Propage affiliate_id aux prospects de cette société sans affilié
  //    (un seul affilié par prospect) + audit prospect-scoped (timeline P14.4).
  try {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_id', company_id)
      .is('affiliate_id', null);
    const prospectIds = (prospects ?? []).map((p) => p.id);
    if (prospectIds.length > 0) {
      await supabase.from('prospects').update({ affiliate_id }).in('id', prospectIds);
      // Une auto-entry timeline par prospect impacté.
      await supabase.from('audit_log').insert(
        prospectIds.map((pid) => ({
          user_id: actorId,
          action: 'update' as const,
          entity_type: 'prospects' as const,
          entity_id: pid,
          after: {
            kind: 'affiliate_company_attached',
            affiliate_id,
            affiliate_name: affiliate.display_name,
            company_id,
          } as never,
        })),
      );
    }
  } catch (err) {
    console.warn(
      '%s propagate-failed company=%s msg=%s',
      LOG_PREFIX,
      company_id,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Audit log strict (entity_type='affiliate_claims').
  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'create',
      entity_type: 'affiliate_claims',
      entity_id: claim.id,
      after: {
        kind: 'affiliate_company_attached',
        actor_role: 'super_admin',
        affiliate_id,
        affiliate_name: affiliate.display_name,
        company_id,
        company_name: company.name,
      } as never,
    });
  } catch {
    // ignore — audit best-effort
  }

  console.warn(
    '%s attached affiliate=%s company=%s claim=%s by=%s',
    LOG_PREFIX,
    affiliate_id,
    company_id,
    claim.id,
    actorId,
  );
  revalidatePath(`/admin/affiliates/${affiliate_id}`);
  return { ok: true, data: { claimId: claim.id } };
}

// ---------------------------------------------------------------------------
// detachCompanyFromAffiliateAction (super_admin)
// ---------------------------------------------------------------------------

const detachSchema = z.object({
  claim_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function detachCompanyFromAffiliateAction(
  input: z.infer<typeof detachSchema>,
): Promise<ActionResult<{ detached: true }>> {
  let actorId: string;
  try {
    const profile = await requireSuperAdmin();
    actorId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = detachSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: claim } = await supabase
    .from('affiliate_claims')
    .select('id, affiliate_id, company_id, source, status')
    .eq('id', parsed.data.claim_id)
    .maybeSingle();
  if (!claim) return { ok: false, error: 'Claim introuvable.' };

  const { error } = await supabase.from('affiliate_claims').delete().eq('id', parsed.data.claim_id);
  if (error) return { ok: false, error: error.message };

  // Note : on ne touche PAS prospects.affiliate_id (impact commission), comme
  // deleteAffiliateClaimAction. Le détachement retire l'attribution future.
  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'delete',
      entity_type: 'affiliate_claims',
      entity_id: parsed.data.claim_id,
      before: {
        kind: 'affiliate_company_detached',
        affiliate_id: claim.affiliate_id,
        company_id: claim.company_id,
        source: claim.source,
        status: claim.status,
      } as never,
      after: {
        kind: 'affiliate_company_detached',
        actor_role: 'super_admin',
        reason: parsed.data.reason,
      } as never,
    });
  } catch {
    // ignore
  }

  console.warn(
    '%s detached claim=%s affiliate=%s by=%s reason=%s',
    LOG_PREFIX,
    parsed.data.claim_id,
    claim.affiliate_id,
    actorId,
    parsed.data.reason,
  );
  revalidatePath(`/admin/affiliates/${claim.affiliate_id}`);
  return { ok: true, data: { detached: true } };
}

// ---------------------------------------------------------------------------
// searchAvailableCompaniesAction (super_admin) — réutilise search_companies_fuzzy
// ---------------------------------------------------------------------------

const searchSchema = z.object({ query: z.string().trim().max(120) });

export interface CompanySearchHit {
  id: string;
  name: string;
  primary_domain: string | null;
  match_type: 'exact' | 'fuzzy';
  /** true si une autre attribution active existe déjà → non sélectionnable. */
  already_claimed: boolean;
}

export async function searchAvailableCompaniesAction(
  input: z.infer<typeof searchSchema>,
): Promise<ActionResult<CompanySearchHit[]>> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const q = parsed.data.query;
  if (q.length < 2) return { ok: true, data: [] };

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('search_companies_fuzzy', {
    p_query: q,
    p_limit_exact: 20,
    p_limit_fuzzy: 5,
  });
  if (error) {
    console.warn('%s search-rpc-failed msg=%s', LOG_PREFIX, error.message);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    primary_domain: string | null;
    match_type: string;
  }>;
  if (rows.length === 0) return { ok: true, data: [] };

  // Annoter les sociétés déjà attribuées (claim actif, n'importe quel affilié).
  const ids = rows.map((r) => r.id);
  const { data: activeClaims } = await supabase
    .from('affiliate_claims')
    .select('company_id')
    .eq('status', 'active')
    .in('company_id', ids);
  const claimedSet = new Set((activeClaims ?? []).map((c) => c.company_id));

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      primary_domain: r.primary_domain,
      match_type: r.match_type === 'fuzzy' ? 'fuzzy' : 'exact',
      already_claimed: claimedSet.has(r.id),
    })),
  };
}
