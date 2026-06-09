/**
 * Queries lecture affiliate_claims — P7.x.1.F
 *
 * Toutes les queries passent par le service-role client : la session
 * affilie est un JWT custom (pas un user auth Supabase), donc RLS ne
 * peut pas les authoriser. Le filtre `affiliate_id = session.affiliateId`
 * cote app garantit l'isolation.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type ClaimSource =
  | 'cookie_tracking'
  | 'declared_by_company'
  | 'declared_by_affiliate'
  | 'manual_admin';
export type ClaimStatus = 'pending' | 'active' | 'rejected';

export interface AffilieClaimRow {
  id: string;
  affiliateId: string;
  companyId: string | null;
  prospectId: string | null;
  declaredCompanyName: string | null;
  declaredCompanyWebsite: string | null;
  source: ClaimSource;
  status: ClaimStatus;
  declaredAt: string;
  validatedAt: string | null;
  rejectedReason: string | null;
  notesAffiliate: string | null;
  /** Nom de la company resolue (si company_id != null), sinon null. */
  resolvedCompanyName: string | null;
  /** Commission liee au prospect (si prospect_id != null + commission calculee). */
  commissionEurHt: number | null;
  commissionStatus: 'not_applicable' | 'due' | 'paid' | null;
}

/**
 * Charge tous les claims d'un affilie pour la page "Mes societes". Tri :
 *   pending d'abord (en attente d'action admin),
 *   puis active (deja valides),
 *   puis rejected (info).
 */
export async function listClaimsForAffiliate(affiliateId: string): Promise<AffilieClaimRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('affiliate_claims')
    .select(
      `id, affiliate_id, company_id, prospect_id, declared_company_name,
       declared_company_website, source, status, declared_at, validated_at,
       rejected_reason, notes_affiliate,
       company:companies(name),
       prospect:prospects(commission_eur_ht, commission_status)`,
    )
    .eq('affiliate_id', affiliateId);
  if (error || !data) {
    console.warn('[affiliate-claims/queries] list-failed: %s', error?.message ?? 'unknown');
    return [];
  }
  type Row = {
    id: string;
    affiliate_id: string;
    company_id: string | null;
    prospect_id: string | null;
    declared_company_name: string | null;
    declared_company_website: string | null;
    source: ClaimSource;
    status: ClaimStatus;
    declared_at: string;
    validated_at: string | null;
    rejected_reason: string | null;
    notes_affiliate: string | null;
    company: { name: string | null } | { name: string | null }[] | null;
    prospect:
      | {
          commission_eur_ht: number | string | null;
          commission_status: 'not_applicable' | 'due' | 'paid' | null;
        }
      | {
          commission_eur_ht: number | string | null;
          commission_status: 'not_applicable' | 'due' | 'paid' | null;
        }[]
      | null;
  };
  const rows = (data as Row[]).map((r) => {
    const company = Array.isArray(r.company) ? r.company[0] : r.company;
    const prospect = Array.isArray(r.prospect) ? r.prospect[0] : r.prospect;
    return {
      id: r.id,
      affiliateId: r.affiliate_id,
      companyId: r.company_id,
      prospectId: r.prospect_id,
      declaredCompanyName: r.declared_company_name,
      declaredCompanyWebsite: r.declared_company_website,
      source: r.source,
      status: r.status,
      declaredAt: r.declared_at,
      validatedAt: r.validated_at,
      rejectedReason: r.rejected_reason,
      notesAffiliate: r.notes_affiliate,
      resolvedCompanyName: company?.name ?? null,
      commissionEurHt:
        prospect?.commission_eur_ht != null ? Number(prospect.commission_eur_ht) : null,
      commissionStatus: prospect?.commission_status ?? null,
    } satisfies AffilieClaimRow;
  });
  // Tri : pending > active > rejected, puis declaredAt desc.
  rows.sort((a, b) => {
    const order = { pending: 0, active: 1, rejected: 2 } as const;
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.declaredAt.localeCompare(a.declaredAt);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export interface AdminClaimRow extends AffilieClaimRow {
  affiliateDisplayName: string;
  affiliateToken: string;
  validatedBy: string | null;
  notesAdmin: string | null;
}

export async function listClaimsForAdmin(filterStatus?: ClaimStatus): Promise<AdminClaimRow[]> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('affiliate_claims')
    .select(
      `id, affiliate_id, company_id, prospect_id, declared_company_name,
       declared_company_website, source, status, declared_at, validated_at,
       validated_by, rejected_reason, notes_admin, notes_affiliate,
       affiliate:affiliates!inner(display_name, token),
       company:companies(name),
       prospect:prospects(commission_eur_ht, commission_status)`,
    )
    .order('declared_at', { ascending: false });
  if (filterStatus) query = query.eq('status', filterStatus);
  const { data, error } = await query;
  if (error || !data) {
    console.warn('[affiliate-claims/queries] admin-list-failed: %s', error?.message ?? 'unknown');
    return [];
  }
  return data.map((r) => {
    const affiliate = Array.isArray(r.affiliate) ? r.affiliate[0] : r.affiliate;
    const company = Array.isArray(r.company) ? r.company[0] : r.company;
    const prospect = Array.isArray(r.prospect) ? r.prospect[0] : r.prospect;
    return {
      id: r.id,
      affiliateId: r.affiliate_id,
      companyId: r.company_id,
      prospectId: r.prospect_id,
      declaredCompanyName: r.declared_company_name,
      declaredCompanyWebsite: r.declared_company_website,
      source: r.source as ClaimSource,
      status: r.status as ClaimStatus,
      declaredAt: r.declared_at,
      validatedAt: r.validated_at,
      rejectedReason: r.rejected_reason,
      notesAffiliate: r.notes_affiliate,
      resolvedCompanyName: company?.name ?? null,
      commissionEurHt:
        prospect?.commission_eur_ht != null ? Number(prospect.commission_eur_ht) : null,
      commissionStatus: prospect?.commission_status ?? null,
      affiliateDisplayName: affiliate?.display_name ?? '—',
      affiliateToken: affiliate?.token ?? '',
      validatedBy: r.validated_by,
      notesAdmin: r.notes_admin,
    } satisfies AdminClaimRow;
  });
}

// ---------------------------------------------------------------------------
// P7.x.AffiliateManualCompanyAttach — sociétés attachées manuellement par
// un super_admin à un affilié (claims source='manual_admin', status='active').
// ---------------------------------------------------------------------------

export interface ManualAttachRow {
  claimId: string;
  companyId: string | null;
  companyName: string;
  attachedAt: string;
  /** Nom (ou email) du super_admin qui a attaché — null si non résolu. */
  attachedByName: string | null;
}

export async function listManualAttachmentsForAffiliate(
  affiliateId: string,
): Promise<ManualAttachRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('affiliate_claims')
    .select(
      `id, company_id, declared_company_name, validated_at, validated_by, created_at,
       company:companies(name)`,
    )
    .eq('affiliate_id', affiliateId)
    .eq('source', 'manual_admin')
    .eq('status', 'active')
    .order('validated_at', { ascending: false });
  if (error || !data) {
    console.warn(
      '[affiliate-claims/queries] manual-attachments-failed: %s',
      error?.message ?? 'unknown',
    );
    return [];
  }

  // Résolution best-effort des noms des super_admin (validated_by → users).
  const actorIds = Array.from(
    new Set(data.map((r) => r.validated_by).filter((v): v is string => Boolean(v))),
  );
  const namesById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);
    for (const u of users ?? []) namesById.set(u.id, u.full_name ?? u.email);
  }

  return data.map((r) => {
    const company = Array.isArray(r.company) ? r.company[0] : r.company;
    return {
      claimId: r.id,
      companyId: r.company_id,
      companyName: company?.name ?? r.declared_company_name ?? '(société inconnue)',
      attachedAt: r.validated_at ?? r.created_at,
      attachedByName: r.validated_by ? (namesById.get(r.validated_by) ?? null) : null,
    } satisfies ManualAttachRow;
  });
}

// ---------------------------------------------------------------------------
// Smart match — list affiliates actifs pour le fuzzy match cote signup
// ---------------------------------------------------------------------------

export interface AffiliateLookupRow {
  id: string;
  displayName: string;
  token: string;
}

export async function listActiveAffiliatesForLookup(): Promise<AffiliateLookupRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('affiliates')
    .select('id, display_name, token')
    .eq('is_active', true);
  if (error || !data) {
    console.warn(
      '[affiliate-claims/queries] active-affiliates-failed: %s',
      error?.message ?? 'unknown',
    );
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    token: r.token,
  }));
}
