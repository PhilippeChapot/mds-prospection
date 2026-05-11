import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/admin/KpiCard';
import { RecentActivityFeed } from '@/components/admin/RecentActivityFeed';
import { AlertsCard } from '@/components/admin/AlertsCard';
import { ChartSignupsPerDay } from '@/components/admin/charts/ChartSignupsPerDay';
import { ChartConversionFunnel } from '@/components/admin/charts/ChartConversionFunnel';
import { ChartPoleDistribution } from '@/components/admin/charts/ChartPoleDistribution';
import { ChartRevenueArea } from '@/components/admin/charts/ChartRevenueArea';
import { getActiveSeasonId } from '@/lib/supabase/auth-helpers';
import {
  getDashboardKpis,
  getFunnelByStatus,
  getRecentActivities,
  type FunnelStatusRow,
} from '@/lib/dashboard/queries';
import {
  getSignupsPerDay,
  getFunnelStats,
  getPoleDistribution,
  getRevenueCumulative,
} from '@/lib/dashboard/charts';

export const metadata = { title: 'Dashboard' };

const fmtEur = (eur: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(eur);

export default async function AdminDashboardPage() {
  const seasonId = await getActiveSeasonId();

  // P5.x.6 + P5.x.11 : queries en parallele pour minimiser TTFB.
  // Toutes les queries filtrent season_id + is_test=false (charts.ts
  // applique le meme filtre interne).
  const [kpis, funnel, activities, signupsPerDay, funnelChart, poleDist, revenue] =
    await Promise.all([
      getDashboardKpis(seasonId),
      getFunnelByStatus(seasonId),
      getRecentActivities(seasonId, 10),
      getSignupsPerDay(30),
      getFunnelStats(seasonId),
      getPoleDistribution(seasonId),
      getRevenueCumulative(seasonId, 90),
    ]);

  const isEmpty = kpis.activeProspects === 0 && kpis.paidIntegralCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Pipeline MDS 2026
          </h1>
          <p className="text-md-text-muted text-sm">
            Suivi commercial — Paris (Carrousel du Louvre) · Marseille (Pharo) · Bruxelles (Le Mix)
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/prospects/new">
            <Plus className="size-4" aria-hidden />
            Nouveau prospect
          </Link>
        </Button>
      </div>

      {isEmpty ? (
        <div className="border-md-border bg-card rounded-xl border p-8 text-center shadow-sm">
          <p className="text-md-text mb-2 text-base font-semibold">
            Aucun prospect pour l&apos;instant.
          </p>
          <p className="text-md-text-muted text-sm">
            Démarrez la prospection en publiant le wizard public ou en ajoutant manuellement un
            prospect.
          </p>
        </div>
      ) : null}

      {/* Section 1 : 4 KPI cards */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Prospects actifs"
          value={kpis.activeProspects.toLocaleString('fr-FR')}
          deltaLabel={
            kpis.newThisWeek > 0
              ? `+${kpis.newThisWeek} cette semaine`
              : 'Aucun nouveau cette semaine'
          }
          deltaTone={kpis.newThisWeek > 0 ? 'up' : 'neutral'}
          tone="default"
        />
        <KpiCard
          label="Pipeline non-réalisé"
          value={fmtEur(kpis.pipelineEur)}
          deltaLabel={`${kpis.pendingDevisCount} devis en attente`}
          deltaTone="neutral"
          tone="warning"
        />
        <KpiCard
          label="Encaissé"
          value={fmtEur(kpis.paidEur)}
          deltaLabel={`${kpis.paidProspectsCount} prospect${kpis.paidProspectsCount > 1 ? 's' : ''} payeur${kpis.paidProspectsCount > 1 ? 's' : ''}`}
          deltaTone={kpis.paidEur > 0 ? 'up' : 'neutral'}
          tone="success"
        />
        <KpiCard
          label="Conversion globale"
          value={`${kpis.conversionRate.toFixed(1)} %`}
          deltaLabel={`${kpis.paidIntegralCount} payés / ${kpis.totalActiveCount} actifs`}
          deltaTone="neutral"
          tone="accent"
        />
      </section>

      {/* P5.x.11 — Alertes pipeline (cron-driven) */}
      <AlertsCard />

      {/* Section 2 : Funnel par statut */}
      <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark mb-4 text-sm font-bold tracking-wide uppercase">
          Funnel par statut
        </h2>
        <FunnelTable rows={funnel} />
      </section>

      {/* P5.x.11 — 4 charts (recharts client-side, queries server) */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups / jour (30j)">
          <ChartSignupsPerDay data={signupsPerDay} />
        </ChartCard>
        <ChartCard title="Funnel de conversion (cumul)">
          <ChartConversionFunnel data={funnelChart} />
        </ChartCard>
        <ChartCard title="Répartition par pôle (en cours)">
          <ChartPoleDistribution data={poleDist} />
        </ChartCard>
        <ChartCard title="Revenue cumulé MDS 2026 (90j)">
          <ChartRevenueArea data={revenue} />
        </ChartCard>
      </section>

      {/* Section 3 : Activités récentes */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            Activité récente
          </h2>
          <Link
            href="/admin/audit-log"
            className="text-md-blue text-xs font-medium hover:underline"
          >
            Voir tout l&apos;historique →
          </Link>
        </div>
        <RecentActivityFeed events={activities} />
      </section>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </div>
  );
}

function FunnelTable({ rows }: { rows: FunnelStatusRow[] }) {
  // Calcul du % conversion N vs N-1 (en excluant 'perdu' du calcul).
  const stages = rows.filter((r) => r.status !== 'perdu');
  const lostRow = rows.find((r) => r.status === 'perdu');
  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="space-y-1.5 text-sm">
      {stages.map((row, idx) => {
        const previous = idx > 0 ? stages[idx - 1] : null;
        const conversionPct =
          previous && previous.count > 0 ? Math.round((row.count / previous.count) * 100) : null;
        return (
          <FunnelRow key={row.status} row={row} maxCount={maxCount} conversionPct={conversionPct} />
        );
      })}
      {lostRow ? (
        <FunnelRow key="perdu" row={lostRow} maxCount={maxCount} conversionPct={null} muted />
      ) : null}
    </div>
  );
}

function FunnelRow({
  row,
  maxCount,
  conversionPct,
  muted,
}: {
  row: FunnelStatusRow;
  maxCount: number;
  conversionPct: number | null;
  muted?: boolean;
}) {
  const widthPct = Math.max((row.count / maxCount) * 100, 4);
  const eur =
    row.status === 'acompte_paye' || row.status === 'paye_integral' ? row.paidEur : row.pipelineEur;
  return (
    <div className={`relative overflow-hidden rounded-md ${muted ? 'opacity-60' : ''}`}>
      <div
        className="bg-md-blue/8 absolute inset-y-0 left-0"
        style={{ width: `${widthPct}%` }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="text-md-text font-medium">{row.label}</span>
        <span className="flex items-baseline gap-3 text-xs">
          <strong className="text-md-text text-sm">{row.count.toLocaleString('fr-FR')}</strong>
          {eur > 0 ? <span className="text-md-text-muted">{fmtEur(eur)}</span> : null}
          {conversionPct != null ? (
            <span className="text-md-text-muted font-mono">{conversionPct}%</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
