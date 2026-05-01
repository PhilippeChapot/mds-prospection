import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/admin/KpiCard';
import { PolesBarChart } from '@/components/admin/PolesBarChart';
import { ConversionFunnel } from '@/components/admin/ConversionFunnel';
import { RecentActivityTable } from '@/components/admin/RecentActivityTable';
import {
  KPI_CARDS,
  POLE_DISTRIBUTION,
  CONVERSION_FUNNEL,
  RECENT_ACTIVITY,
} from '@/lib/mock/dashboard-data';

export const metadata = { title: 'Dashboard' };

export default function AdminDashboardPage() {
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {KPI_CARDS.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark mb-4 text-sm font-bold tracking-wide uppercase">
            Repartition par pole
          </h2>
          <PolesBarChart data={POLE_DISTRIBUTION} />
        </div>

        <div className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark mb-4 text-sm font-bold tracking-wide uppercase">
            Funnel conversion
          </h2>
          <ConversionFunnel steps={CONVERSION_FUNNEL} />
        </div>
      </section>

      <section>
        <h2 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">
          Activite recente
        </h2>
        <RecentActivityTable rows={RECENT_ACTIVITY} />
      </section>
    </div>
  );
}
