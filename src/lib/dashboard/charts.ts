/**
 * Helpers SQL pour les 4 charts du dashboard admin V1.1 — P5.x.11.
 *
 * Toutes les queries filtrent season + is_test=false (idem queries.ts P5.x.6).
 * Aggregation cote app (volume < 5k rows/season, pas besoin de CTE SQL).
 *
 * Logs structures (prefix [dashboard/charts]).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMdsRevenueTarget2026 } from '@/lib/config/event';

const LOG_PREFIX = '[dashboard/charts]';

// ============================================================================
// Chart 1 — Signups par jour (30j, verified vs non-verified)
// ============================================================================

export interface SignupsPerDayPoint {
  /** ISO date YYYY-MM-DD. */
  day: string;
  /** Nombre de signups verifies (DOI confirme) ce jour. */
  verified: number;
  /** Nombre de signups crees mais pas encore verifies. */
  notVerified: number;
}

export async function getSignupsPerDay(days = 30): Promise<SignupsPerDayPoint[]> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('public_signup_attempts')
    .select('created_at, verified_at')
    .gte('created_at', since);

  if (error) {
    console.error('%s signups-per-day error msg=%s', LOG_PREFIX, error.message);
    return [];
  }

  // Bucketise par jour UTC.
  const buckets = new Map<string, { verified: number; notVerified: number }>();
  // Pre-remplit les `days` derniers jours pour avoir des 0 visibles sur le chart.
  for (let i = 0; i < days; i += 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { verified: 0, notVerified: 0 });
  }

  for (const row of (data ?? []) as Array<{
    created_at: string;
    verified_at: string | null;
  }>) {
    const day = row.created_at.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue; // ignore les rows hors fenetre (shouldn't happen)
    if (row.verified_at) bucket.verified += 1;
    else bucket.notVerified += 1;
  }

  return Array.from(buckets.entries())
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// ============================================================================
// Chart 2 — Funnel de conversion (5 etapes, cumul)
// ============================================================================

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

export async function getFunnelStats(seasonId: string): Promise<FunnelStep[]> {
  const supabase = await createSupabaseServerClient();

  const [signupsRes, verifiedRes, completedRes, devisRes, signedRes, paidRes] = await Promise.all([
    supabase.from('public_signup_attempts').select('id', { count: 'exact', head: true }),
    supabase
      .from('public_signup_attempts')
      .select('id', { count: 'exact', head: true })
      .not('verified_at', 'is', null),
    supabase
      .from('public_signup_attempts')
      .select('id', { count: 'exact', head: true })
      .not('step2_submitted_at', 'is', null),
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .not('sellsy_devis_id', 'is', null),
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .not('signed_at', 'is', null),
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .not('acompte_paid_at', 'is', null),
  ]);

  return [
    { key: 'signup', label: 'Inscription', count: signupsRes.count ?? 0 },
    { key: 'verified', label: 'Email vérifié', count: verifiedRes.count ?? 0 },
    { key: 'wizard_done', label: 'Wizard complété', count: completedRes.count ?? 0 },
    { key: 'devis', label: 'Devis émis', count: devisRes.count ?? 0 },
    { key: 'signed', label: 'Devis signé', count: signedRes.count ?? 0 },
    { key: 'paid', label: 'Payé', count: paidRes.count ?? 0 },
  ];
}

// ============================================================================
// Chart 3 — Repartition par pole (etat courant)
// ============================================================================

export interface PoleDistributionPoint {
  code: string;
  label: string;
  count: number;
}

const POLE_LABELS: Record<string, string> = {
  AUDIO_RADIO: 'Audio & Radio',
  VIDEO_CTV: 'Vidéo & CTV',
  REGIES_RETAIL_MEDIA: 'Régies & Retail',
  DIFFUSION_INFRA: 'Diffusion & Infra',
  DATA_ADTECH: 'Data & AdTech',
  OUTDOOR_DOOH: 'Outdoor & DOOH',
  INCONNU: 'Inconnu',
};

export async function getPoleDistribution(seasonId: string): Promise<PoleDistributionPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('prospects')
    .select('id, company:companies!inner(pole:poles(code))')
    .eq('season_id', seasonId)
    .eq('is_test', false)
    .in('status', ['lead', 'contact', 'devis_envoye', 'signe', 'acompte_paye', 'paye_integral']);

  if (error) {
    console.error('%s pole-dist error msg=%s', LOG_PREFIX, error.message);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    company: { pole: { code: string } | { code: string }[] | null } | null;
  }>) {
    const pole = pickFirst(row.company?.pole);
    const code = pole?.code ?? 'INCONNU';
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  // Ordre stable + force inclusion des poles connus a 0.
  const order = [
    'AUDIO_RADIO',
    'VIDEO_CTV',
    'REGIES_RETAIL_MEDIA',
    'DIFFUSION_INFRA',
    'DATA_ADTECH',
    'OUTDOOR_DOOH',
    'INCONNU',
  ];
  return order
    .map((code) => ({
      code,
      label: POLE_LABELS[code] ?? code,
      count: counts.get(code) ?? 0,
    }))
    .filter((p) => p.count > 0); // n'affiche pas les poles a 0 (donut illisible)
}

// ============================================================================
// Chart 4 — Revenue cumule (90j area)
// ============================================================================

export interface RevenueCumulativePoint {
  day: string;
  cumulativeTtc: number;
}

export interface RevenueCumulativeResult {
  points: RevenueCumulativePoint[];
  target: number;
}

export async function getRevenueCumulative(
  seasonId: string,
  days = 90,
): Promise<RevenueCumulativeResult> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Chaque prospect "paye" contribue son acompte_amount_eur a la date
  // de acompte_paid_at. Si le paiement integral est tombe, le total
  // sellsy_devis_total_ttc est utilise a la place (= cumul plus precis).
  const { data, error } = await supabase
    .from('prospects')
    .select('acompte_paid_at, acompte_amount_eur, sellsy_devis_total_ttc, status')
    .eq('season_id', seasonId)
    .eq('is_test', false)
    .not('acompte_paid_at', 'is', null)
    .gte('acompte_paid_at', since);

  if (error) {
    console.error('%s revenue error msg=%s', LOG_PREFIX, error.message);
    return { points: [], target: getMdsRevenueTarget2026() };
  }

  // Bucket par jour.
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of (data ?? []) as Array<{
    acompte_paid_at: string | null;
    acompte_amount_eur: number | null;
    sellsy_devis_total_ttc: number | null;
    status: string;
  }>) {
    if (!row.acompte_paid_at) continue;
    const day = row.acompte_paid_at.slice(0, 10);
    const bucket = buckets.get(day);
    if (bucket == null) continue;
    // Si statut = paye_integral, le montant total TTC est encaissé ; sinon
    // seulement l'acompte.
    const amount =
      row.status === 'paye_integral'
        ? Number(row.sellsy_devis_total_ttc ?? row.acompte_amount_eur ?? 0)
        : Number(row.acompte_amount_eur ?? 0);
    buckets.set(day, bucket + amount);
  }

  // Cumule chronologiquement.
  let cumulative = 0;
  const points = Array.from(buckets.entries())
    .map(([day, daily]) => ({ day, daily }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ day, daily }) => {
      cumulative += daily;
      return { day, cumulativeTtc: Math.round(cumulative) };
    });

  return { points, target: getMdsRevenueTarget2026() };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
