/**
 * Helper data loader Espace Affilie — P7.x.1.B
 *
 * Charge l'integralite des donnees dont a besoin un affilie pour afficher
 * son dashboard self-service (Stats / Tracking / Paiements). UNE seule
 * query Supabase par sous-page suffit (volume faible : 10-30 affilies
 * max + < 100 prospects par affilie).
 *
 * Service-role obligatoire : la session affilie est un JWT custom (pas un
 * user Supabase auth.users), donc RLS ne peut pas l'autoriser. Le filtre
 * `affiliate_id = <session.affiliateId>` cote serveur garantit qu'un
 * affilie ne peut JAMAIS voir les donnees d'un autre (verifie cote action).
 *
 * Note RGPD : on n'expose JAMAIS les emails / telephones des contacts
 * prospects (pas de SELECT contact). Seuls le nom de l'entreprise +
 * status sont remontes pour le suivi commission.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { capitalizeName } from '@/lib/format/name';

const LOG_PREFIX = '[affilie/dashboard-data]';

export type AffilieType = 'media' | 'referral';
export type CommissionStatus = 'not_applicable' | 'due' | 'paid';

export interface AffilieProfile {
  id: string;
  token: string;
  displayName: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactPhone: string | null;
  type: AffilieType;
  commissionPercent: number;
  iban: string | null;
  bic: string | null;
  nomTitulaireCompte: string | null;
  lastLoginAt: string | null;
}

export interface AffilieKpis {
  /** Clics tracking 30 derniers jours. */
  clicks30d: number;
  /** Clics tracking depuis la creation. */
  clicksTotal: number;
  /** Inscriptions converties en prospect (toute equipe pipeline). */
  prospectsCount: number;
  /** Prospects avec acompte_paid_at != null (= ventes effectives). */
  convertedCount: number;
  /** Commission status='due' (validee mais pas encore payee). */
  commissionDueEur: number;
  /** Commission status='paid' (cumul lifetime). */
  commissionPaidEur: number;
}

export interface AffilieCommissionRow {
  /** prospects.id (sert de cle React). */
  prospectId: string;
  /** Date de conversion (acompte_paid_at) ou null si pas encore paye. */
  convertedAt: string | null;
  companyName: string;
  /** TTC du devis sellsy (sert d'info contextuelle). */
  devisTotalTtc: number | null;
  commissionEurHt: number | null;
  commissionStatus: CommissionStatus;
  commissionPaidAt: string | null;
  commissionPaymentReference: string | null;
}

export interface AffilieDashboardData {
  profile: AffilieProfile;
  kpis: AffilieKpis;
  commissions: AffilieCommissionRow[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Charge le profil affilie + KPIs + commissions. Throw si l'affilie
 * n'existe pas ou est archive (is_active=false) — geste defensif au cas
 * ou un cookie session ancien resterait valide apres archivage admin.
 */
export async function loadAffilieDashboardData(affiliateId: string): Promise<AffilieDashboardData> {
  const supabase = getSupabaseServiceClient();

  const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  // 4 queries en parallele :
  //   - affiliate row (profile)
  //   - count clicks 30d
  //   - count clicks total
  //   - prospects join companies (commissions + counts)
  const [affiliateRes, clicks30dRes, clicksTotalRes, prospectsRes] = await Promise.all([
    supabase
      .from('affiliates')
      .select(
        `id, token, display_name, contact_email, contact_first_name, contact_last_name,
         contact_phone, type, commission_percent, iban, bic, nom_titulaire_compte,
         last_login_at, is_active`,
      )
      .eq('id', affiliateId)
      .maybeSingle(),
    supabase
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId)
      .gte('created_at', since30d),
    supabase
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId),
    supabase
      .from('prospects')
      .select(
        `id, status, acompte_paid_at, sellsy_devis_total_ttc, commission_eur_ht,
         commission_status, commission_paid_at, commission_payment_reference,
         company:companies!inner(name)`,
      )
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false }),
  ]);

  if (affiliateRes.error || !affiliateRes.data) {
    throw new Error(`Affiliate not found: ${affiliateRes.error?.message ?? affiliateId}`);
  }
  const aff = affiliateRes.data;
  if (!aff.is_active) {
    throw new Error(`Affiliate ${affiliateId} is archived (is_active=false)`);
  }

  const profile: AffilieProfile = {
    id: aff.id,
    token: aff.token,
    displayName: aff.display_name,
    contactEmail: aff.contact_email,
    contactFirstName: capitalizeName(aff.contact_first_name ?? '') || null,
    contactLastName: capitalizeName(aff.contact_last_name ?? '') || null,
    contactPhone: aff.contact_phone,
    type: aff.type as AffilieType,
    commissionPercent: Number(aff.commission_percent),
    iban: aff.iban,
    bic: aff.bic,
    nomTitulaireCompte: aff.nom_titulaire_compte,
    lastLoginAt: aff.last_login_at,
  };

  // Aggregate prospects -> KPIs + commission rows.
  type ProspectRow = {
    id: string;
    status: string;
    acompte_paid_at: string | null;
    sellsy_devis_total_ttc: number | string | null;
    commission_eur_ht: number | string | null;
    commission_status: CommissionStatus;
    commission_paid_at: string | null;
    commission_payment_reference: string | null;
    company: { name: string | null } | { name: string | null }[] | null;
  };
  const prospects = (prospectsRes.data ?? []) as ProspectRow[];

  let convertedCount = 0;
  let commissionDueEur = 0;
  let commissionPaidEur = 0;
  const commissions: AffilieCommissionRow[] = [];
  for (const p of prospects) {
    if (p.acompte_paid_at) convertedCount += 1;
    const c = Number(p.commission_eur_ht ?? 0);
    if (p.commission_status === 'due') commissionDueEur += c;
    else if (p.commission_status === 'paid') commissionPaidEur += c;
    const companyRow = Array.isArray(p.company) ? p.company[0] : p.company;
    commissions.push({
      prospectId: p.id,
      convertedAt: p.acompte_paid_at,
      companyName: companyRow?.name ?? '—',
      devisTotalTtc: p.sellsy_devis_total_ttc != null ? Number(p.sellsy_devis_total_ttc) : null,
      commissionEurHt: p.commission_eur_ht != null ? Number(p.commission_eur_ht) : null,
      commissionStatus: p.commission_status,
      commissionPaidAt: p.commission_paid_at,
      commissionPaymentReference: p.commission_payment_reference,
    });
  }

  // Tri commissions : status='due' d'abord (a payer), puis 'paid' (recents
  // en haut), puis 'not_applicable' (lead pas converti).
  commissions.sort((a, b) => {
    const orderA = a.commissionStatus === 'due' ? 0 : a.commissionStatus === 'paid' ? 1 : 2;
    const orderB = b.commissionStatus === 'due' ? 0 : b.commissionStatus === 'paid' ? 1 : 2;
    if (orderA !== orderB) return orderA - orderB;
    // Au sein d'un meme groupe : convertedAt desc (recent en haut)
    if (a.convertedAt && b.convertedAt) return b.convertedAt.localeCompare(a.convertedAt);
    if (a.convertedAt) return -1;
    if (b.convertedAt) return 1;
    return 0;
  });

  const kpis: AffilieKpis = {
    clicks30d: clicks30dRes.count ?? 0,
    clicksTotal: clicksTotalRes.count ?? 0,
    prospectsCount: prospects.length,
    convertedCount,
    commissionDueEur,
    commissionPaidEur,
  };

  console.log(
    '%s loaded affiliate=%s clicks_30d=%d prospects=%d converted=%d',
    LOG_PREFIX,
    affiliateId,
    kpis.clicks30d,
    kpis.prospectsCount,
    kpis.convertedCount,
  );

  return { profile, kpis, commissions };
}

// ---------------------------------------------------------------------------
// Tracking links — pure (no DB)
// ---------------------------------------------------------------------------

export interface TrackingLink {
  /** Cle stable pour React + i18n. */
  id: 'landing-fr' | 'landing-en' | 'signup-fr' | 'signup-en';
  labelKey: string;
  url: string;
}

/**
 * Genere les liens tracking que l'affilie peut copier-coller. Pure
 * function (URL builder uniquement) — testable sans DB.
 */
export function buildTrackingLinks(baseUrl: string, token: string): TrackingLink[] {
  // Nettoie le trailing slash du baseUrl pour eviter `//?ref=`.
  const root = baseUrl.replace(/\/+$/, '');
  const ref = encodeURIComponent(token);
  return [
    {
      id: 'landing-fr',
      labelKey: 'landingFr',
      url: `${root}/fr?ref=${ref}`,
    },
    {
      id: 'landing-en',
      labelKey: 'landingEn',
      url: `${root}/en?ref=${ref}`,
    },
    {
      id: 'signup-fr',
      labelKey: 'signupFr',
      url: `${root}/fr/inscription-partenaire?ref=${ref}`,
    },
    {
      id: 'signup-en',
      labelKey: 'signupEn',
      url: `${root}/en/partner-registration?ref=${ref}`,
    },
  ];
}
