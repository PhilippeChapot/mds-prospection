import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listAffiliatesWithStats } from '@/lib/affiliates/queries';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Affilies' };
export const dynamic = 'force-dynamic';

const fmtEur = (eur: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(eur);

export default async function AffiliatesPage() {
  // P5.x.1-quater (bug #2) — defense in depth : affilies = admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  const affiliates = await listAffiliatesWithStats();
  const active = affiliates.filter((a) => a.isActive);
  const archived = affiliates.filter((a) => !a.isActive);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Affiliés &amp; commissions
          </h1>
          <p className="text-md-text-muted text-sm">
            Apporteurs d&apos;affaires (médias partenaires &amp; parrainages exposants). Commission
            calculée automatiquement à l&apos;acompte payé.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/affiliates/new">
            <Plus className="size-4" aria-hidden />
            Nouvel affilié
          </Link>
        </Button>
      </div>

      <AffiliatesTable rows={active} title="Affiliés actifs" />

      {archived.length > 0 ? (
        <div className="opacity-60">
          <AffiliatesTable rows={archived} title="Archivés" />
        </div>
      ) : null}
    </div>
  );
}

function AffiliatesTable({
  rows,
  title,
}: {
  rows: Awaited<ReturnType<typeof listAffiliatesWithStats>>;
  title: string;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-md-text-muted mb-2 text-[11px] font-bold tracking-widest uppercase">
          {title}
        </h2>
        <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-6 text-center text-sm shadow-sm">
          Aucun affilié.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-md-text-muted mb-2 text-[11px] font-bold tracking-widest uppercase">
        {title}
      </h2>
      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Taux</th>
                <th className="px-4 py-3 text-right">Signups</th>
                <th className="px-4 py-3 text-right">Convertis</th>
                <th className="px-4 py-3 text-right">Cumulé</th>
                <th className="px-4 py-3 text-right">Payé</th>
                <th className="px-4 py-3 text-right">À payer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-md-border hover:bg-muted/20 border-t">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/affiliates/${row.id}`}
                      className="hover:text-md-blue hover:underline"
                    >
                      {row.token}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-md-text font-semibold">{row.displayName}</div>
                    {row.contactEmail ? (
                      <div className="text-md-text-muted truncate text-xs">{row.contactEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={
                        row.type === 'media'
                          ? 'bg-md-blue/10 text-md-blue rounded px-2 py-0.5 font-semibold'
                          : 'bg-md-magenta/10 text-md-magenta rounded px-2 py-0.5 font-semibold'
                      }
                    >
                      {row.type === 'media' ? 'Media' : 'Referral'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {row.commissionPercent.toFixed(2)} %
                  </td>
                  <td className="px-4 py-3 text-right">{row.signupsCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-md-text font-semibold">{row.convertedCount}</span>
                    {row.prospectsCount > row.convertedCount ? (
                      <span className="text-md-text-muted ml-1 text-xs">
                        / {row.prospectsCount}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {fmtEur(row.commissionTotalEur)}
                  </td>
                  <td className="text-md-success px-4 py-3 text-right">
                    {fmtEur(row.commissionPaidEur)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      row.commissionDueEur > 0 ? 'text-md-warning' : 'text-md-text-muted'
                    }`}
                  >
                    {fmtEur(row.commissionDueEur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
