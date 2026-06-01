/**
 * Dashboard admin queries — P5.x.6.
 *
 * 3 helpers que la page /admin (Server Component) appelle en parallele
 * via Promise.all. Tous filtrent sur la saison active + is_test=false
 * (exclusion des prospects de test pour ne pas polluer les KPIs).
 *
 * Utilise le client Supabase server (pas service-role) : les RLS sales
 * applicables filtrent deja sur season_id, mais on l'explicite pour
 * permettre une migration future vers une page multi-saisons.
 *
 * Logs structures (prefix [dashboard/queries]).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type ProspectStatus = Database['public']['Enums']['prospect_status'];

const LOG_PREFIX = '[dashboard/queries]';

// ============================================================================
// KPIs (4 cartes)
// ============================================================================

export interface DashboardKpis {
  /** Card 1 : count prospects status != 'perdu'. */
  activeProspects: number;
  /** Card 1 — sous-info : count prospects crees depuis lundi 00:00. */
  newThisWeek: number;
  /** Card 2 : SUM(sellsy_devis_total_ttc) WHERE status IN ('devis_envoye','signe'). */
  pipelineEur: number;
  /** Card 2 — sous-info : count prospects dans le pipeline. */
  pendingDevisCount: number;
  /** Card 3 : SUM(acompte_amount_eur) WHERE status IN ('acompte_paye','paye_integral'). */
  paidEur: number;
  /** Card 3 — sous-info : count prospects payeurs. */
  paidProspectsCount: number;
  /** Card 4 : count(paye_integral) / count(active) * 100. */
  conversionRate: number;
  /** Card 4 — sous-info : count(paye_integral). */
  paidIntegralCount: number;
  /** Card 4 — sous-info : count(active total). */
  totalActiveCount: number;
}

export async function getDashboardKpis(seasonId: string): Promise<DashboardKpis> {
  const supabase = await createSupabaseServerClient();

  // Lundi 00:00 (local Europe/Paris -> ISO UTC). Pour MVP on utilise UTC :
  // un prospect cree dimanche 23:00 Paris (= 22:00 UTC) compte comme cette
  // semaine. Tolerable cote KPI hebdo.
  const now = new Date();
  const day = now.getUTCDay(); // 0 = dimanche
  const offsetDays = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offsetDays);
  monday.setUTCHours(0, 0, 0, 0);
  const mondayIso = monday.toISOString();

  // 5 queries en parallele : count actifs + nouveaux + devis-envoye/signe +
  // payeurs + paye_integral.
  const [activeRes, newWeekRes, pendingRes, paidRes, integralRes] = await Promise.all([
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .neq('status', 'perdu'),
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .gte('created_at', mondayIso),
    supabase
      .from('prospects')
      .select('sellsy_devis_total_ttc')
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .in('status', ['devis_envoye', 'signe']),
    supabase
      .from('prospects')
      .select('acompte_amount_eur')
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .in('status', ['acompte_paye', 'paye_integral']),
    supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('is_test', false)
      .eq('status', 'paye_integral'),
  ]);

  if (
    activeRes.error ||
    newWeekRes.error ||
    pendingRes.error ||
    paidRes.error ||
    integralRes.error
  ) {
    const errs = [activeRes, newWeekRes, pendingRes, paidRes, integralRes]
      .map((r) => r.error?.message)
      .filter(Boolean);
    console.error('%s db-error msg=%s', LOG_PREFIX, errs.join(' | '));
  }

  const totalActiveCount = activeRes.count ?? 0;
  const newThisWeek = newWeekRes.count ?? 0;
  const paidIntegralCount = integralRes.count ?? 0;

  const pendingRows = (pendingRes.data ?? []) as Array<{ sellsy_devis_total_ttc: number | null }>;
  const pipelineEur = pendingRows.reduce(
    (acc, r) => acc + Number(r.sellsy_devis_total_ttc ?? 0),
    0,
  );
  const pendingDevisCount = pendingRows.length;

  const paidRows = (paidRes.data ?? []) as Array<{ acompte_amount_eur: number | null }>;
  const paidEur = paidRows.reduce((acc, r) => acc + Number(r.acompte_amount_eur ?? 0), 0);
  const paidProspectsCount = paidRows.length;

  const conversionRate = totalActiveCount > 0 ? (paidIntegralCount / totalActiveCount) * 100 : 0;

  return {
    activeProspects: totalActiveCount,
    newThisWeek,
    pipelineEur,
    pendingDevisCount,
    paidEur,
    paidProspectsCount,
    conversionRate,
    paidIntegralCount,
    totalActiveCount,
  };
}

// ============================================================================
// Funnel par statut (6 lignes)
// ============================================================================

export interface FunnelStatusRow {
  status: ProspectStatus;
  label: string;
  count: number;
  pipelineEur: number;
  paidEur: number;
}

const FUNNEL_ORDER: { status: ProspectStatus; label: string }[] = [
  { status: 'lead', label: 'Lead' },
  { status: 'devis_envoye', label: 'Devis envoyé' },
  { status: 'signe', label: 'Signé' },
  { status: 'acompte_paye', label: 'Acompte payé' },
  { status: 'paye_integral', label: 'Payé intégral' },
  { status: 'perdu', label: 'Perdu' },
];

export async function getFunnelByStatus(seasonId: string): Promise<FunnelStatusRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('prospects')
    .select('status, sellsy_devis_total_ttc, acompte_amount_eur')
    .eq('season_id', seasonId)
    .eq('is_test', false);

  if (error) {
    console.error('%s funnel-db-error msg=%s', LOG_PREFIX, error.message);
    return FUNNEL_ORDER.map((s) => ({ ...s, count: 0, pipelineEur: 0, paidEur: 0 }));
  }

  const rows = (data ?? []) as Array<{
    status: ProspectStatus;
    sellsy_devis_total_ttc: number | null;
    acompte_amount_eur: number | null;
  }>;

  // Aggregate cote app (volume faible, < 1000 prospects par saison).
  const buckets = new Map<
    ProspectStatus,
    { count: number; pipelineEur: number; paidEur: number }
  >();
  for (const row of rows) {
    const b = buckets.get(row.status) ?? { count: 0, pipelineEur: 0, paidEur: 0 };
    b.count += 1;
    b.pipelineEur += Number(row.sellsy_devis_total_ttc ?? 0);
    b.paidEur += Number(row.acompte_amount_eur ?? 0);
    buckets.set(row.status, b);
  }

  return FUNNEL_ORDER.map(({ status, label }) => {
    const b = buckets.get(status) ?? { count: 0, pipelineEur: 0, paidEur: 0 };
    return { status, label, count: b.count, pipelineEur: b.pipelineEur, paidEur: b.paidEur };
  });
}

// ============================================================================
// Recent activities (audit_log)
// ============================================================================

export type ActivityType =
  | 'prospect_created'
  | 'devis_emitted'
  | 'devis_signed'
  | 'acompte_paid'
  | 'lost'
  | 'other';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  /** Label court, ex: "Devis émis", "Acompte payé". */
  label: string;
  /** Detail enrichi : "D-20260509-02697 — RCS Europe (5130€)". null si pas de prospect joinable. */
  detail: string | null;
  /** UUID prospect (pour deeplink /admin/prospects/[id]). null pour "other". */
  prospectId: string | null;
  createdAt: string;
  /**
   * Pre-format relatif "il y a 5 min" calcule cote query (cote server,
   * Date.now() interdit pendant le render selon la regle ESLint
   * react-hooks/purity ; cf. fix P5.x.2 sur le dashboard exposant).
   */
  relativeLabel: string;
}

interface AuditLogRow {
  id: string;
  action: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Lit les N dernieres entrees audit_log pour la table prospects et les
 * classifie en transitions metier (devis_emitted, devis_signed, etc.).
 *
 * Pas de filtre season_id : audit_log n'a pas season_id direct, on
 * filtre via JSONB after.season_id (couvre les operations recentes
 * post-P0 ou les triggers ajoutaient tous les champs au snapshot).
 */
export async function getRecentActivities(seasonId: string, limit = 10): Promise<ActivityEvent[]> {
  const supabase = await createSupabaseServerClient();

  // On fetch un peu plus que `limit` car certaines entrees update sont
  // classifiees 'other' (ex: edit notes) — on les filtre apres.
  const fetchLimit = Math.max(limit * 3, 30);
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity_type, entity_id, before, after, created_at')
    .eq('entity_type', 'prospects')
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    console.error('%s audit-db-error msg=%s', LOG_PREFIX, error.message);
    return [];
  }

  const rows = (data ?? []) as AuditLogRow[];

  // Filtre season_id via after.season_id (audit_log capture le snapshot
  // complet post-trigger, donc l'attribut est present).
  const filtered = rows.filter((r) => {
    const seasonInAfter = (r.after as { season_id?: string } | null)?.season_id;
    const seasonInBefore = (r.before as { season_id?: string } | null)?.season_id;
    return seasonInAfter === seasonId || seasonInBefore === seasonId;
  });

  // Classify chaque entree, drop 'other' qui ne represente pas une
  // transition d'interet (edit notes, reaffectation owner, etc.).
  const classified: ActivityEvent[] = [];
  for (const r of filtered) {
    const ev = classify(r);
    if (ev.type !== 'other') {
      classified.push(ev);
      if (classified.length >= limit * 2) break; // marge avant enrichissement
    }
  }

  // Enrichissement : fetch company names en 1 seule query pour eviter N+1.
  const prospectIds = Array.from(
    new Set(classified.map((e) => e.prospectId).filter((id): id is string => !!id)),
  );
  const companyByProspect = new Map<string, string>();
  if (prospectIds.length > 0) {
    const { data: pData } = await supabase
      .from('prospects')
      .select('id, company:companies!inner(name)')
      .in('id', prospectIds);
    if (pData) {
      for (const p of pData as Array<{
        id: string;
        company: { name: string } | { name: string }[] | null;
      }>) {
        const co = Array.isArray(p.company) ? p.company[0] : p.company;
        if (co?.name) companyByProspect.set(p.id, co.name);
      }
    }
  }

  // Enrichit detail avec company name + relativeLabel cote serveur.
  // Date.now() ici est OK : on est dans une fonction async non-component
  // (pas de regle react-hooks/purity qui s'applique).
  const nowMs = Date.now();
  return classified.slice(0, limit).map((ev) => {
    const relativeLabel = formatRelativeLabel(ev.createdAt, nowMs);
    if (!ev.prospectId) return { ...ev, relativeLabel };
    const companyName = companyByProspect.get(ev.prospectId);
    if (!companyName) return { ...ev, relativeLabel };
    const enriched = ev.detail ? `${ev.detail} — ${companyName}` : companyName;
    return { ...ev, relativeLabel, detail: enriched };
  });
}

function formatRelativeLabel(iso: string, nowMs: number): string {
  const ms = nowMs - new Date(iso).getTime();
  // P6.x-BURGER-FIX : timeZone explicite pour eviter mismatch SSR (UTC sur
  // Vercel) vs CSR (Europe/Paris). Sans ca, le RecentActivityFeed peut
  // afficher une heure differente cote serveur vs client et bail out
  // l hydration React (#418) - cause connue des onClick morts type burger.
  if (ms < 0) return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `il y a ${day} j`;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Paris',
  });
}

/**
 * Classifie une entree audit_log prospects en ActivityType + label.
 * Compare before/after snapshots pour detecter les transitions :
 *   - sellsy_devis_id NULL -> not NULL : devis_emitted
 *   - signed_at      NULL -> not NULL : devis_signed
 *   - acompte_paid_at NULL -> not NULL : acompte_paid
 *   - status         x   -> 'perdu'   : lost
 *   - action='create'                 : prospect_created
 */
function classify(row: AuditLogRow): ActivityEvent {
  const after = row.after as Record<string, unknown> | null;
  const before = row.before as Record<string, unknown> | null;
  const prospectId = row.entity_id;
  const createdAt = row.created_at;

  if (row.action === 'create') {
    return {
      id: row.id,
      type: 'prospect_created',
      label: 'Nouveau prospect',
      detail: extractDevisNumber(after),
      prospectId,
      createdAt,
      relativeLabel: '',
    };
  }

  if (row.action === 'update' && before && after) {
    if (!before.sellsy_devis_id && after.sellsy_devis_id) {
      return {
        id: row.id,
        type: 'devis_emitted',
        label: 'Devis émis',
        detail: extractDevisNumber(after),
        prospectId,
        createdAt,
        relativeLabel: '',
      };
    }
    if (!before.signed_at && after.signed_at) {
      return {
        id: row.id,
        type: 'devis_signed',
        label: 'Devis signé',
        detail: extractDevisNumber(after),
        prospectId,
        createdAt,
        relativeLabel: '',
      };
    }
    if (!before.acompte_paid_at && after.acompte_paid_at) {
      const amount = Number((after.acompte_amount_eur as number | null) ?? 0);
      return {
        id: row.id,
        type: 'acompte_paid',
        label: 'Acompte payé',
        detail: amount > 0 ? `${formatEur(amount)}` : null,
        prospectId,
        createdAt,
        relativeLabel: '',
      };
    }
    if (before.status !== 'perdu' && after.status === 'perdu') {
      return {
        id: row.id,
        type: 'lost',
        label: 'Marqué perdu',
        detail: null,
        prospectId,
        createdAt,
        relativeLabel: '',
      };
    }
  }

  return {
    id: row.id,
    type: 'other',
    label: 'Mise à jour',
    detail: null,
    prospectId,
    createdAt,
    relativeLabel: '',
  };
}

function extractDevisNumber(snapshot: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  const num = snapshot.sellsy_devis_number as string | null | undefined;
  return num ?? null;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
