/**
 * Engine alertes admin — P5.x.11.
 *
 * Helpers calcules par le cron /api/cron/admin-alerts (hourly).
 *
 * 6 kinds (skipped alerte 5 "prospect sans contact admin" = besoin
 * email_logs, reporte V1.2) :
 *   - devis_unsigned_7d      : devis_envoye depuis >= 7j (warning)
 *   - devis_unsigned_14d     : idem 14j (critical)
 *   - pl_unpaid_14d          : payment link genere depuis >= 14j sans paid_at
 *   - verified_unconverted_21d : signup verified depuis >= 21j sans prospect lie
 *   - booth_unassigned_t30   : prospect signe/paye + event a <= 30j + booth null
 *   - vat_eu_unverified_5k   : prospect avec devis >= 5000 HT + UE non-FR + non verifie
 *
 * Logique cron :
 *   1. computeAlerts(kind) -> liste des candidats actuels
 *   2. UPSERT dans admin_alerts (ON CONFLICT dedup unique partial index)
 *   3. Auto-resolve : compare avec les alertes existantes du meme kind,
 *      marque resolved_at=now() pour celles qui ne sont plus dans la liste
 *
 * Logs structures (prefix [dashboard/alerts]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isAutoliquidationApplicable } from '@/lib/vies/verify';
import { getNextEventDate } from '@/lib/config/event';

const LOG_PREFIX = '[dashboard/alerts]';

export type AlertKind =
  | 'devis_unsigned_7d'
  | 'devis_unsigned_14d'
  | 'pl_unpaid_14d'
  | 'verified_unconverted_21d'
  | 'booth_unassigned_t30'
  | 'vat_eu_unverified_5k';

export type AlertSeverity = 'warning' | 'critical';

export interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  prospectId: string | null;
  signupId: string | null;
  message: string;
  details: Record<string, unknown>;
}

// ============================================================================
// Compute helpers (1 par kind)
// ============================================================================

export async function computeAlertsForKind(kind: AlertKind): Promise<AlertCandidate[]> {
  switch (kind) {
    case 'devis_unsigned_7d':
      return computeDevisUnsigned(7, 'warning', 'devis_unsigned_7d');
    case 'devis_unsigned_14d':
      return computeDevisUnsigned(14, 'critical', 'devis_unsigned_14d');
    case 'pl_unpaid_14d':
      return computePlUnpaid(14);
    case 'verified_unconverted_21d':
      return computeVerifiedUnconverted(21);
    case 'booth_unassigned_t30':
      return computeBoothUnassigned(30);
    case 'vat_eu_unverified_5k':
      return computeVatEuUnverified(5000);
  }
}

async function computeDevisUnsigned(
  days: number,
  severity: AlertSeverity,
  kind: AlertKind,
): Promise<AlertCandidate[]> {
  const supabase = getSupabaseServiceClient();
  const threshold = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from('prospects')
    .select(
      'id, sellsy_devis_number, sellsy_devis_emitted_at, signed_at, status, is_test, company:companies!inner(name)',
    )
    .eq('is_test', false)
    .eq('status', 'devis_envoye')
    .not('sellsy_devis_emitted_at', 'is', null)
    .is('signed_at', null)
    .lt('sellsy_devis_emitted_at', threshold);

  return (
    (data ?? []) as Array<{
      id: string;
      sellsy_devis_number: string | null;
      sellsy_devis_emitted_at: string | null;
      company: { name: string } | { name: string }[] | null;
    }>
  ).map((p) => {
    const company = pickFirst(p.company);
    const ageDays = p.sellsy_devis_emitted_at
      ? Math.floor((Date.now() - new Date(p.sellsy_devis_emitted_at).getTime()) / 86_400_000)
      : days;
    return {
      kind,
      severity,
      prospectId: p.id,
      signupId: null,
      message: `Devis ${p.sellsy_devis_number ?? '—'} émis depuis ${ageDays}j sans signature (${company?.name ?? '?'})`,
      details: {
        ageDays,
        devisNumber: p.sellsy_devis_number,
        companyName: company?.name,
      },
    };
  });
}

async function computePlUnpaid(days: number): Promise<AlertCandidate[]> {
  const supabase = getSupabaseServiceClient();
  // On utilise les notes prospects (audit trail du PL) + le champ
  // acompte_payment_link_url (P5.x.2 migration 0031). On lit
  // acompte_payment_link_expires_at - 14j comme proxy de la date de
  // creation du PL (expiresAt - 30 = creation au pire).
  // Plus simple : on filtre sur acompte_payment_link_expires_at qui est
  // typiquement creation + 30j ; donc "PL vieux de >= 14j" =
  // acompte_payment_link_expires_at <= now() + (30 - 14) = +16j.
  const ttlDays = 30;
  const cutoffMs = Date.now() + (ttlDays - days) * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const { data } = await supabase
    .from('prospects')
    .select(
      'id, sellsy_devis_number, acompte_payment_link_expires_at, is_test, company:companies!inner(name)',
    )
    .eq('is_test', false)
    .is('acompte_paid_at', null)
    .not('acompte_payment_link_url', 'is', null)
    .lt('acompte_payment_link_expires_at', cutoffIso);

  return (
    (data ?? []) as Array<{
      id: string;
      sellsy_devis_number: string | null;
      acompte_payment_link_expires_at: string | null;
      company: { name: string } | { name: string }[] | null;
    }>
  ).map((p) => {
    const company = pickFirst(p.company);
    return {
      kind: 'pl_unpaid_14d',
      severity: 'warning' as const,
      prospectId: p.id,
      signupId: null,
      message: `Payment Link non payé depuis ${days}j+ (${company?.name ?? '?'})`,
      details: {
        devisNumber: p.sellsy_devis_number,
        plExpiresAt: p.acompte_payment_link_expires_at,
        companyName: company?.name,
      },
    };
  });
}

async function computeVerifiedUnconverted(days: number): Promise<AlertCandidate[]> {
  const supabase = getSupabaseServiceClient();
  const threshold = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from('public_signup_attempts')
    .select('id, email, contact_first_name, contact_last_name, company_name_input, verified_at')
    .not('verified_at', 'is', null)
    .is('converted_to_prospect_id', null)
    .is('step2_submitted_at', null)
    .lt('verified_at', threshold)
    .neq('status', 'rejected');

  return (
    (data ?? []) as Array<{
      id: string;
      email: string;
      contact_first_name: string | null;
      contact_last_name: string | null;
      company_name_input: string | null;
      verified_at: string | null;
    }>
  ).map((s) => {
    const ageDays = s.verified_at
      ? Math.floor((Date.now() - new Date(s.verified_at).getTime()) / 86_400_000)
      : days;
    return {
      kind: 'verified_unconverted_21d' as const,
      severity: 'warning' as const,
      prospectId: null,
      signupId: s.id,
      message: `Signup vérifié non converti depuis ${ageDays}j : ${s.company_name_input ?? s.email}`,
      details: {
        ageDays,
        email: s.email,
        companyNameInput: s.company_name_input,
      },
    };
  });
}

async function computeBoothUnassigned(thresholdDays: number): Promise<AlertCandidate[]> {
  const nextEvent = getNextEventDate();
  const daysToEvent = (nextEvent.getTime() - Date.now()) / 86_400_000;
  // Si event > thresholdDays jours dans le futur, pas d'alerte.
  if (daysToEvent > thresholdDays) return [];

  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('prospects')
    .select('id, sellsy_devis_number, status, is_test, company:companies!inner(name)')
    .eq('is_test', false)
    .in('status', ['signe', 'acompte_paye', 'paye_integral'])
    .is('booth_assignment', null);

  return (
    (data ?? []) as Array<{
      id: string;
      sellsy_devis_number: string | null;
      status: string;
      company: { name: string } | { name: string }[] | null;
    }>
  ).map((p) => {
    const company = pickFirst(p.company);
    const daysRemaining = Math.max(0, Math.floor(daysToEvent));
    return {
      kind: 'booth_unassigned_t30' as const,
      severity: 'critical' as const,
      prospectId: p.id,
      signupId: null,
      message: `Stand non attribué (T-${daysRemaining}j) — ${company?.name ?? '?'}`,
      details: {
        daysToEvent: daysRemaining,
        eventDate: nextEvent.toISOString().slice(0, 10),
        status: p.status,
        companyName: company?.name,
      },
    };
  });
}

async function computeVatEuUnverified(minHt: number): Promise<AlertCandidate[]> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('prospects')
    .select(
      `id, sellsy_devis_number, sellsy_devis_total_ttc, is_test,
       company:companies!inner(name, vat_country, vat_verified)`,
    )
    .eq('is_test', false)
    .not('sellsy_devis_id', 'is', null)
    .gte('sellsy_devis_total_ttc', minHt * 1.2); // HT >= minHt -> TTC >= minHt * 1.2

  const rows = (data ?? []) as Array<{
    id: string;
    sellsy_devis_number: string | null;
    sellsy_devis_total_ttc: number | null;
    company:
      | {
          name: string;
          vat_country: string | null;
          vat_verified: 'unverified' | 'pending' | 'valid' | 'invalid' | null;
        }
      | Array<{
          name: string;
          vat_country: string | null;
          vat_verified: 'unverified' | 'pending' | 'valid' | 'invalid' | null;
        }>
      | null;
  }>;

  const candidates: AlertCandidate[] = [];
  for (const p of rows) {
    const company = pickFirst(p.company);
    if (!company) continue;
    // Filtre UE non-FR + VAT non-valide. isAutoliquidationApplicable
    // retourne true si UE non-FR + vat_verified='valid' ; donc on leve
    // l'alerte si UE non-FR mais NON applicable (absent / pending / invalid).
    const isApplicable = isAutoliquidationApplicable(company.vat_country, company.vat_verified);
    const isEuNonFr = !!company.vat_country && company.vat_country !== 'FR' && !isApplicable;
    if (!isEuNonFr) continue;

    const ttc = Number(p.sellsy_devis_total_ttc ?? 0);
    candidates.push({
      kind: 'vat_eu_unverified_5k',
      severity: 'critical',
      prospectId: p.id,
      signupId: null,
      message: `TVA UE non vérifiée sur devis ${p.sellsy_devis_number ?? '—'} (${company.name}, ${company.vat_country}, ${formatEur(ttc)} TTC)`,
      details: {
        devisNumber: p.sellsy_devis_number,
        totalTtc: ttc,
        vatCountry: company.vat_country,
        vatVerified: company.vat_verified,
        companyName: company.name,
      },
    });
  }
  return candidates;
}

// ============================================================================
// Sync (UPSERT + auto-resolve)
// ============================================================================

export interface AlertSyncResult {
  inserted: number;
  resolved: number;
  errors: number;
}

const ALL_KINDS: AlertKind[] = [
  'devis_unsigned_7d',
  'devis_unsigned_14d',
  'pl_unpaid_14d',
  'verified_unconverted_21d',
  'booth_unassigned_t30',
  'vat_eu_unverified_5k',
];

export async function syncAllAlerts(): Promise<AlertSyncResult> {
  const supabase = getSupabaseServiceClient();
  let inserted = 0;
  let resolved = 0;
  let errors = 0;

  for (const kind of ALL_KINDS) {
    try {
      const candidates = await computeAlertsForKind(kind);

      // UPSERT each candidate. Conflict cible : (kind, prospect_id) ou
      // (kind, signup_id) partial unique indexes. On utilise `onConflict`
      // de Supabase upsert pour viser le bon index.
      for (const c of candidates) {
        if (c.prospectId) {
          const { error } = await supabase.from('admin_alerts').upsert(
            {
              kind: c.kind,
              severity: c.severity,
              prospect_id: c.prospectId,
              message: c.message,
              details: c.details as unknown as never,
            },
            { onConflict: 'kind,prospect_id', ignoreDuplicates: true },
          );
          if (error) {
            // Ignore 23505 (alerte deja active) — c'est le comportement attendu.
            if (error.code === '23505') continue;
            console.warn('%s upsert-error kind=%s msg=%s', LOG_PREFIX, kind, error.message);
            errors += 1;
          } else {
            inserted += 1;
          }
        } else if (c.signupId) {
          const { error } = await supabase.from('admin_alerts').upsert(
            {
              kind: c.kind,
              severity: c.severity,
              signup_id: c.signupId,
              message: c.message,
              details: c.details as unknown as never,
            },
            { onConflict: 'kind,signup_id', ignoreDuplicates: true },
          );
          if (error) {
            if (error.code === '23505') continue;
            errors += 1;
          } else {
            inserted += 1;
          }
        }
      }

      // Auto-resolve : marque resolved_at=now() pour les alertes du meme
      // kind dont le prospect_id / signup_id ne figure plus dans candidates.
      const activeProspectIds = new Set(
        candidates.map((c) => c.prospectId).filter((id): id is string => !!id),
      );
      const activeSignupIds = new Set(
        candidates.map((c) => c.signupId).filter((id): id is string => !!id),
      );

      const { data: existing } = await supabase
        .from('admin_alerts')
        .select('id, prospect_id, signup_id')
        .eq('kind', kind)
        .is('resolved_at', null);

      for (const row of (existing ?? []) as Array<{
        id: string;
        prospect_id: string | null;
        signup_id: string | null;
      }>) {
        const stillActive =
          (row.prospect_id && activeProspectIds.has(row.prospect_id)) ||
          (row.signup_id && activeSignupIds.has(row.signup_id));
        if (!stillActive) {
          const { error } = await supabase
            .from('admin_alerts')
            .update({ resolved_at: new Date().toISOString() })
            .eq('id', row.id);
          if (error) {
            errors += 1;
          } else {
            resolved += 1;
          }
        }
      }
    } catch (err) {
      errors += 1;
      console.error(
        '%s kind=%s unexpected msg=%s',
        LOG_PREFIX,
        kind,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    '%s sync-done inserted=%d resolved=%d errors=%d',
    LOG_PREFIX,
    inserted,
    resolved,
    errors,
  );
  return { inserted, resolved, errors };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
