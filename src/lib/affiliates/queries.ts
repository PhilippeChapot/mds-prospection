/**
 * Affiliate admin queries — P5.x.7
 *
 * Helpers utilises par les pages /admin/affiliates et /admin/affiliates/[id].
 *
 * Stats agregees calculees cote app (volume d'affilies attendu < 100 pour
 * MDS 2026, donc pas de SQL CTE complexe). Toutes les queries filtrent
 * sur les affiliates actifs (is_active=true) sauf indication contraire.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AffiliateStats {
  id: string;
  token: string;
  displayName: string;
  contactEmail: string | null;
  type: 'media' | 'referral';
  commissionPercent: number;
  isActive: boolean;
  /** Nombre de signups attribues (peu importe statut prospect). */
  signupsCount: number;
  /** Nombre de prospects attribues. */
  prospectsCount: number;
  /** Nombre de prospects payeurs (acompte_paid_at != null). */
  convertedCount: number;
  /** Total commissions calculees (status='due' ou 'paid'). */
  commissionTotalEur: number;
  /** Total commissions deja payees (status='paid'). */
  commissionPaidEur: number;
  /** Total commissions dues (status='due'). */
  commissionDueEur: number;
}

export async function listAffiliatesWithStats(): Promise<AffiliateStats[]> {
  const supabase = await createSupabaseServerClient();

  const [affiliatesRes, signupCounts, prospectsRes] = await Promise.all([
    supabase
      .from('affiliates')
      .select(
        'id, token, display_name, contact_email, type, commission_percent, is_active, created_at',
      )
      .order('display_name', { ascending: true }),
    supabase.from('public_signup_attempts').select('affiliate_id').not('affiliate_id', 'is', null),
    supabase
      .from('prospects')
      .select('affiliate_id, commission_eur_ht, commission_status, acompte_paid_at')
      .not('affiliate_id', 'is', null),
  ]);

  const affiliates = (affiliatesRes.data ?? []) as Array<{
    id: string;
    token: string;
    display_name: string;
    contact_email: string | null;
    type: 'media' | 'referral';
    commission_percent: number;
    is_active: boolean;
  }>;

  // Aggregate signup counts par affiliate.
  const signupByAffiliate = new Map<string, number>();
  for (const s of (signupCounts.data ?? []) as Array<{ affiliate_id: string }>) {
    signupByAffiliate.set(s.affiliate_id, (signupByAffiliate.get(s.affiliate_id) ?? 0) + 1);
  }

  // Aggregate prospects + commission par affiliate.
  type ProspectRow = {
    affiliate_id: string;
    commission_eur_ht: number | null;
    commission_status: 'not_applicable' | 'due' | 'paid';
    acompte_paid_at: string | null;
  };
  const prospectsByAffiliate = new Map<string, ProspectRow[]>();
  for (const p of (prospectsRes.data ?? []) as ProspectRow[]) {
    const arr = prospectsByAffiliate.get(p.affiliate_id) ?? [];
    arr.push(p);
    prospectsByAffiliate.set(p.affiliate_id, arr);
  }

  return affiliates.map((a) => {
    const prospects = prospectsByAffiliate.get(a.id) ?? [];
    let commissionTotalEur = 0;
    let commissionPaidEur = 0;
    let commissionDueEur = 0;
    let convertedCount = 0;
    for (const p of prospects) {
      if (p.acompte_paid_at) convertedCount += 1;
      const c = Number(p.commission_eur_ht ?? 0);
      if (p.commission_status === 'due') {
        commissionDueEur += c;
        commissionTotalEur += c;
      } else if (p.commission_status === 'paid') {
        commissionPaidEur += c;
        commissionTotalEur += c;
      }
    }
    return {
      id: a.id,
      token: a.token,
      displayName: a.display_name,
      contactEmail: a.contact_email,
      type: a.type,
      commissionPercent: Number(a.commission_percent),
      isActive: a.is_active,
      signupsCount: signupByAffiliate.get(a.id) ?? 0,
      prospectsCount: prospects.length,
      convertedCount,
      commissionTotalEur,
      commissionPaidEur,
      commissionDueEur,
    };
  });
}

export interface AffiliateDetailProspect {
  id: string;
  status: string;
  companyName: string;
  sellsyDevisNumber: string | null;
  sellsyDevisTotalTtc: number | null;
  acomptePaidAt: string | null;
  commissionEurHt: number | null;
  commissionStatus: 'not_applicable' | 'due' | 'paid';
  commissionPaidAt: string | null;
  commissionPaymentReference: string | null;
}

export interface AffiliateDetail {
  affiliate: AffiliateStats;
  prospects: AffiliateDetailProspect[];
}

export async function getAffiliateDetail(affiliateId: string): Promise<AffiliateDetail | null> {
  const supabase = await createSupabaseServerClient();

  const [affRes, prospectsRes, signupCountRes] = await Promise.all([
    supabase
      .from('affiliates')
      .select('id, token, display_name, contact_email, type, commission_percent, is_active')
      .eq('id', affiliateId)
      .maybeSingle(),
    supabase
      .from('prospects')
      .select(
        `id, status, sellsy_devis_number, sellsy_devis_total_ttc, acompte_paid_at,
         commission_eur_ht, commission_status, commission_paid_at, commission_payment_reference,
         company:companies!inner(name)`,
      )
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false }),
    supabase
      .from('public_signup_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId),
  ]);

  if (affRes.error || !affRes.data) return null;
  const a = affRes.data;

  const prospectRows = (prospectsRes.data ?? []) as Array<{
    id: string;
    status: string;
    sellsy_devis_number: string | null;
    sellsy_devis_total_ttc: number | null;
    acompte_paid_at: string | null;
    commission_eur_ht: number | null;
    commission_status: 'not_applicable' | 'due' | 'paid';
    commission_paid_at: string | null;
    commission_payment_reference: string | null;
    company: { name: string } | { name: string }[] | null;
  }>;

  const prospects: AffiliateDetailProspect[] = prospectRows.map((p) => ({
    id: p.id,
    status: p.status,
    companyName: (Array.isArray(p.company) ? p.company[0]?.name : p.company?.name) ?? '—',
    sellsyDevisNumber: p.sellsy_devis_number,
    sellsyDevisTotalTtc: p.sellsy_devis_total_ttc != null ? Number(p.sellsy_devis_total_ttc) : null,
    acomptePaidAt: p.acompte_paid_at,
    commissionEurHt: p.commission_eur_ht != null ? Number(p.commission_eur_ht) : null,
    commissionStatus: p.commission_status,
    commissionPaidAt: p.commission_paid_at,
    commissionPaymentReference: p.commission_payment_reference,
  }));

  let commissionTotalEur = 0;
  let commissionPaidEur = 0;
  let commissionDueEur = 0;
  let convertedCount = 0;
  for (const p of prospects) {
    if (p.acomptePaidAt) convertedCount += 1;
    const c = p.commissionEurHt ?? 0;
    if (p.commissionStatus === 'due') {
      commissionDueEur += c;
      commissionTotalEur += c;
    } else if (p.commissionStatus === 'paid') {
      commissionPaidEur += c;
      commissionTotalEur += c;
    }
  }

  return {
    affiliate: {
      id: a.id,
      token: a.token,
      displayName: a.display_name,
      contactEmail: a.contact_email,
      type: a.type,
      commissionPercent: Number(a.commission_percent),
      isActive: a.is_active,
      signupsCount: signupCountRes.count ?? 0,
      prospectsCount: prospects.length,
      convertedCount,
      commissionTotalEur,
      commissionPaidEur,
      commissionDueEur,
    },
    prospects,
  };
}
