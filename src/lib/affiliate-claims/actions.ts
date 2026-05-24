'use server';

/**
 * Server actions affiliate_claims — P7.x.1.F
 *
 * 4 actions :
 *   - declareCompanyByAffiliateAction(input)  : affilie connecte declare
 *     une societe demarchee. Smart match dans companies (fuzzy). Le
 *     claim est cree status='pending' (anti-fraude : tout passage par
 *     declared_by_affiliate exige validation admin).
 *
 *   - validateAffiliateClaimAction(input)     : admin valide un claim
 *     pending. Si claim source='declared_by_affiliate' sans company_id
 *     resolue, l'admin peut soit (a) reaffecter a une company existante,
 *     soit (b) creer une nouvelle company a partir du declared_name.
 *     -> claim.status='active' + validated_at + validated_by.
 *     -> si prospect existe pour cette company, on propage l'affiliate_id
 *        au prospect (auto-assignation, deja en place via webhook cookie).
 *
 *   - rejectAffiliateClaimAction(input)       : admin rejette un claim
 *     pending. claim.status='rejected' + rejected_reason + validated_at.
 *
 *   - deleteAffiliateClaimAction(input)       : SUPER_ADMIN UNIQUEMENT.
 *     Supprime un claim actif (anti-fraude : retire l'attribution a
 *     l'affilie, potentiel impact sur sa commission). Audit log strict.
 *
 * Audit log : chaque action INSERT dans audit_log avec
 *   action ∈ {'create','update','delete'},
 *   entity_type='affiliate_claims',
 *   entity_id=claim.id,
 *   before/after avec kind='claim_<verb>'.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile, requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { requireAffilieSession } from '@/lib/affilie/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { fuzzyRank, MATCH_EXACT_THRESHOLD } from './fuzzy';
import { normalizeDomain, extractEmailDomain, isValidDomain } from '@/lib/utils/domain';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[affiliate-claims/actions]';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// declareCompanyByAffiliateAction
// ---------------------------------------------------------------------------

const declareSchema = z.object({
  declared_company_name: z.string().trim().min(2).max(200),
  declared_company_website: z.string().trim().max(300).optional().or(z.literal('')),
  notes_affiliate: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type DeclareInput = z.infer<typeof declareSchema>;
export type DeclareResult = ActionResult<{
  claimId: string;
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  status: 'pending';
}>;

/**
 * Affilie connecte declare une societe demarchee (creation manuelle).
 * Le smart match est best-effort : on cherche la company qui matche le
 * mieux par nom OU domaine, mais on garde toujours status='pending'
 * meme si match exact (anti-fraude : un admin doit valider).
 */
export async function declareCompanyByAffiliateAction(
  locale: string,
  input: DeclareInput,
): Promise<DeclareResult> {
  const { affiliateId } = await requireAffilieSession(locale);
  const parsed = declareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  // Smart match : fetch toutes les companies par name + primary_domain
  // + alternate_domains. Pour le volume cible (< 5k companies), on charge
  // tout et fuzzy en memoire — pas de query trgm SQL exotique necessaire.
  const websiteDomain = data.declared_company_website
    ? (() => {
        const n = normalizeDomain(data.declared_company_website);
        return n && isValidDomain(n) ? n : null;
      })()
    : null;

  let matchedCompanyId: string | null = null;
  let matchedCompanyName: string | null = null;

  try {
    // 1. Match par domaine prioritaire (si fourni)
    if (websiteDomain) {
      const { data: byDomain } = await supabase
        .from('companies')
        .select('id, name')
        .or(`primary_domain.eq.${websiteDomain},alternate_domains.cs.{${websiteDomain}}`)
        .limit(1);
      if (byDomain && byDomain.length > 0) {
        matchedCompanyId = byDomain[0].id;
        matchedCompanyName = byDomain[0].name;
      }
    }
    // 2. Fallback : fuzzy match par nom
    if (!matchedCompanyId) {
      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id, name')
        .limit(5000);
      if (allCompanies && allCompanies.length > 0) {
        const ranked = fuzzyRank(
          allCompanies as Array<{ id: string; name: string }>,
          data.declared_company_name,
          (c) => c.name,
          MATCH_EXACT_THRESHOLD,
        );
        if (ranked.length > 0) {
          matchedCompanyId = ranked[0].item.id;
          matchedCompanyName = ranked[0].item.name;
        }
      }
    }
  } catch (err) {
    console.warn(
      '%s smart-match-failed name=%s msg=%s',
      LOG_PREFIX,
      data.declared_company_name,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Verifier qu'il n'existe pas deja un claim sur cette paire (UNIQUE
  // contrainte DB nous protege, mais on retourne un message clair).
  if (matchedCompanyId) {
    const { data: existing } = await supabase
      .from('affiliate_claims')
      .select('id, status')
      .eq('affiliate_id', affiliateId)
      .eq('company_id', matchedCompanyId)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error: 'Vous avez déjà un claim sur cette société (statut : ' + existing.status + ').',
      };
    }
  }

  const { data: claim, error } = await supabase
    .from('affiliate_claims')
    .insert({
      affiliate_id: affiliateId,
      company_id: matchedCompanyId,
      declared_company_name: data.declared_company_name,
      declared_company_website: data.declared_company_website || null,
      source: 'declared_by_affiliate',
      status: 'pending', // toujours pending pour declared_by_affiliate (anti-fraude)
      notes_affiliate: data.notes_affiliate || null,
    })
    .select('id')
    .single();

  if (error || !claim) {
    console.error('%s insert-failed msg=%s', LOG_PREFIX, error?.message ?? 'unknown');
    return { ok: false, error: 'Échec de la déclaration. Réessayez plus tard.' };
  }

  // Audit log best-effort
  try {
    await supabase.from('audit_log').insert({
      user_id: null,
      action: 'create',
      entity_type: 'affiliate_claims',
      entity_id: claim.id,
      after: {
        kind: 'claim_declared',
        actor: 'affiliate_self',
        affiliate_id: affiliateId,
        declared_company_name: data.declared_company_name,
        matched_company_id: matchedCompanyId,
        source: 'declared_by_affiliate',
      } as never,
    });
  } catch {
    // ignore
  }

  console.log(
    '%s claim-declared affiliate=%s claim=%s matched=%s',
    LOG_PREFIX,
    affiliateId,
    claim.id,
    matchedCompanyId ?? '-',
  );
  revalidatePath(`/${locale}/affilie/dashboard/societes`);
  return {
    ok: true,
    data: {
      claimId: claim.id,
      matchedCompanyId,
      matchedCompanyName,
      status: 'pending',
    },
  };
}

// ---------------------------------------------------------------------------
// validateAffiliateClaimAction (admin)
// ---------------------------------------------------------------------------

const validateSchema = z
  .object({
    claim_id: z.string().uuid(),
    company_id: z.string().uuid().optional(),
    create_new_company: z.boolean().optional(),
    notes_admin: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.company_id || v.create_new_company, {
    message: 'Choisir une company existante OU create_new_company=true.',
  });

export async function validateAffiliateClaimAction(
  input: z.infer<typeof validateSchema>,
): Promise<ActionResult<{ claimId: string; companyId: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'super_admin') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = validateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const data = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: claim, error: lookupErr } = await supabase
    .from('affiliate_claims')
    .select('id, affiliate_id, company_id, declared_company_name, declared_company_website, status')
    .eq('id', data.claim_id)
    .maybeSingle();
  if (lookupErr || !claim) return { ok: false, error: 'Claim introuvable' };
  if (claim.status !== 'pending') {
    return { ok: false, error: `Claim déjà ${claim.status} (uniquement pending validable)` };
  }

  let resolvedCompanyId = data.company_id ?? claim.company_id ?? null;

  // Si admin choisit "create new company", on cree depuis le declared_name
  if (data.create_new_company && !data.company_id) {
    const candidateDomain = claim.declared_company_website
      ? (() => {
          const n = normalizeDomain(claim.declared_company_website);
          return n && isValidDomain(n) ? n : null;
        })()
      : null;
    const { data: created, error: createErr } = await supabase
      .from('companies')
      .insert({
        name: claim.declared_company_name ?? '—',
        name_normalized: (claim.declared_company_name ?? '').toLowerCase().trim(),
        primary_domain: candidateDomain,
        category: 'standard',
      })
      .select('id')
      .single();
    if (createErr || !created) {
      return { ok: false, error: `Création company échouée : ${createErr?.message}` };
    }
    resolvedCompanyId = created.id;
  }

  if (!resolvedCompanyId) {
    return { ok: false, error: 'Aucune company résolue pour ce claim.' };
  }

  // Verifier qu'il n'existe pas deja un claim ACTIF (affiliate_id, company_id)
  // pour un autre affilie sur la meme company.
  const { data: conflicting } = await supabase
    .from('affiliate_claims')
    .select('id, affiliate_id')
    .eq('company_id', resolvedCompanyId)
    .eq('status', 'active')
    .neq('affiliate_id', claim.affiliate_id)
    .maybeSingle();
  if (conflicting) {
    return {
      ok: false,
      error: 'Conflit : cette société est déjà attribuée à un autre affilié (claim actif).',
    };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('affiliate_claims')
    .update({
      company_id: resolvedCompanyId,
      status: 'active',
      validated_at: now,
      validated_by: profile.id,
      notes_admin: data.notes_admin ?? null,
      updated_at: now,
    })
    .eq('id', data.claim_id);
  if (updateErr) return { ok: false, error: updateErr.message };

  // P7.x.1.F — Propager affiliate_id sur les prospects de cette company
  // qui n'ont pas encore d'affiliate (un seul affilie par prospect).
  try {
    await supabase
      .from('prospects')
      .update({ affiliate_id: claim.affiliate_id })
      .eq('company_id', resolvedCompanyId)
      .is('affiliate_id', null);
  } catch (err) {
    console.warn(
      '%s prospect-affiliate-propagate-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Audit log
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: 'update',
      entity_type: 'affiliate_claims',
      entity_id: claim.id,
      before: { kind: 'claim_validated', status: 'pending' } as never,
      after: {
        kind: 'claim_validated',
        status: 'active',
        company_id: resolvedCompanyId,
        created_new_company: data.create_new_company === true,
      } as never,
    });
  } catch {
    // ignore
  }

  console.log(
    '%s claim-validated claim=%s by=%s company=%s',
    LOG_PREFIX,
    claim.id,
    profile.id,
    resolvedCompanyId,
  );
  revalidatePath('/admin/affiliate-claims');
  return { ok: true, data: { claimId: claim.id, companyId: resolvedCompanyId } };
}

// ---------------------------------------------------------------------------
// rejectAffiliateClaimAction (admin)
// ---------------------------------------------------------------------------

const rejectSchema = z.object({
  claim_id: z.string().uuid(),
  rejected_reason: z.string().trim().min(3).max(500),
});

export async function rejectAffiliateClaimAction(
  input: z.infer<typeof rejectSchema>,
): Promise<ActionResult<{ claimId: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'super_admin') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: claim } = await supabase
    .from('affiliate_claims')
    .select('id, status')
    .eq('id', parsed.data.claim_id)
    .maybeSingle();
  if (!claim) return { ok: false, error: 'Claim introuvable' };
  if (claim.status !== 'pending') {
    return { ok: false, error: `Claim déjà ${claim.status} (uniquement pending rejetable)` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('affiliate_claims')
    .update({
      status: 'rejected',
      rejected_reason: parsed.data.rejected_reason,
      validated_at: now,
      validated_by: profile.id,
      updated_at: now,
    })
    .eq('id', parsed.data.claim_id);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: 'update',
      entity_type: 'affiliate_claims',
      entity_id: parsed.data.claim_id,
      before: { kind: 'claim_rejected', status: 'pending' } as never,
      after: {
        kind: 'claim_rejected',
        status: 'rejected',
        rejected_reason: parsed.data.rejected_reason,
      } as never,
    });
  } catch {
    // ignore
  }

  console.log('%s claim-rejected claim=%s by=%s', LOG_PREFIX, parsed.data.claim_id, profile.id);
  revalidatePath('/admin/affiliate-claims');
  return { ok: true, data: { claimId: parsed.data.claim_id } };
}

// ---------------------------------------------------------------------------
// deleteAffiliateClaimAction (super_admin ONLY)
// ---------------------------------------------------------------------------

const deleteSchema = z.object({
  claim_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function deleteAffiliateClaimAction(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult<{ deleted: true }>> {
  // Throw si role != super_admin (caught -> ok:false)
  let profileId: string;
  try {
    const profile = await requireSuperAdmin();
    profileId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: claim } = await supabase
    .from('affiliate_claims')
    .select('id, affiliate_id, company_id, status')
    .eq('id', parsed.data.claim_id)
    .maybeSingle();
  if (!claim) return { ok: false, error: 'Claim introuvable' };

  const { error } = await supabase.from('affiliate_claims').delete().eq('id', parsed.data.claim_id);
  if (error) return { ok: false, error: error.message };

  // Audit log strict (super_admin destructif)
  try {
    await supabase.from('audit_log').insert({
      user_id: profileId,
      action: 'delete',
      entity_type: 'affiliate_claims',
      entity_id: parsed.data.claim_id,
      before: {
        kind: 'claim_deleted',
        affiliate_id: claim.affiliate_id,
        company_id: claim.company_id,
        status: claim.status,
      } as never,
      after: {
        kind: 'claim_deleted',
        reason: parsed.data.reason,
        actor_role: 'super_admin',
      } as never,
    });
  } catch {
    // ignore
  }

  console.warn(
    '%s claim-deleted-by-super-admin claim=%s by=%s reason=%s',
    LOG_PREFIX,
    parsed.data.claim_id,
    profileId,
    parsed.data.reason,
  );
  revalidatePath('/admin/affiliate-claims');
  return { ok: true, data: { deleted: true } };
}
