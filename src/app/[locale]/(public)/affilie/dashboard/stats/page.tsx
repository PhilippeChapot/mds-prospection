/**
 * Section Stats — Espace Affilie — P7.x.1.B
 *
 * Affiche 6 KPI cards live :
 *   - Clics tracking 30j / lifetime
 *   - Inscriptions captees (prospects creees via ref)
 *   - Ventes payees (acompte_paid_at != null)
 *   - Commission a percevoir (status=due)
 *   - Commission percue (status=paid, lifetime)
 *
 * Pas de graph timeline en V1 — Phil pourra ajouter recharts en V2 si
 * pertinent. Pour le volume cible (10-30 affilies, < 100 prospects /
 * affilie), les chiffres bruts suffisent.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { loadAffilieDashboardData } from '@/lib/affilie/dashboard-data';
import { listExcludedCompanies } from '@/lib/affiliates/excluded-companies';
import { Card } from '@/components/ui/card';
import { CommissionExclusionBanner } from '../_components/CommissionExclusionBanner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Statistiques · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieStatsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.stats' });

  const [{ kpis }, excludedCompanies] = await Promise.all([
    loadAffilieDashboardData(affiliateId),
    listExcludedCompanies(),
  ]);

  const fmtEur = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  const hasAnyData =
    kpis.clicksTotal > 0 ||
    kpis.prospectsCount > 0 ||
    kpis.convertedCount > 0 ||
    kpis.commissionDueEur > 0 ||
    kpis.commissionPaidEur > 0;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      {/* P7.x.1.D — Banner regle d'exclusion commission (PRS exhibitors) */}
      <CommissionExclusionBanner excludedCompanies={excludedCompanies} />

      {!hasAnyData ? (
        <Card className="border-md-border bg-md-bg-soft border-dashed p-5 text-sm shadow-none">
          <p className="text-md-text-muted">{t('noData')}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label={t('kpiClicks30d')} value={kpis.clicks30d.toString()} accent="blue" />
        <Kpi label={t('kpiClicksTotal')} value={kpis.clicksTotal.toString()} accent="default" />
        <Kpi label={t('kpiProspects')} value={kpis.prospectsCount.toString()} accent="default" />
        <Kpi label={t('kpiConverted')} value={kpis.convertedCount.toString()} accent="emerald" />
        <Kpi
          label={t('kpiCommissionDue')}
          value={fmtEur.format(kpis.commissionDueEur)}
          accent={kpis.commissionDueEur > 0 ? 'magenta' : 'default'}
        />
        <Kpi
          label={t('kpiCommissionPaid')}
          value={fmtEur.format(kpis.commissionPaidEur)}
          accent="emerald"
        />
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'default' | 'blue' | 'emerald' | 'magenta';
}) {
  const valueClass = {
    default: 'text-md-text',
    blue: 'text-md-blue',
    emerald: 'text-emerald-700',
    magenta: 'text-md-magenta',
  }[accent];
  return (
    <Card className="border-md-border bg-card p-4 shadow-sm">
      <p className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${valueClass}`}>{value}</p>
    </Card>
  );
}
