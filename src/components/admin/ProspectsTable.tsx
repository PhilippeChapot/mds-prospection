import Link from 'next/link';
import { CompanyAvatar } from './CompanyAvatar';
import { PoleBadge } from './PoleBadge';
import { StatusPill } from './StatusPill';
import { SyncBadges } from './SyncBadges';
import type { ProspectListRow } from '@/lib/mock/dashboard-data';

const CATEGORY_LABEL: Record<ProspectListRow['category'], React.ReactNode> = {
  prs_exhibitor: <strong className="text-md-magenta text-[11px]">PRS</strong>,
  standard: <span className="text-md-text-muted text-xs">Standard</span>,
  non_eligible: <span className="text-md-text-muted text-xs">Non eligible</span>,
};

function formatEur(value: number | null) {
  if (value === null) return '—';
  return `${value.toLocaleString('fr-FR')} €`;
}

export function ProspectsTable({ rows }: { rows: ProspectListRow[] }) {
  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-3 py-3">
                <input type="checkbox" aria-label="Selectionner tous" className="size-3.5" />
              </th>
              <th className="px-4 py-3">Societe / Contact</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Pole</th>
              <th className="px-4 py-3">Categorie</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Affilie</th>
              <th className="px-4 py-3 text-right">€ HT</th>
              <th className="px-4 py-3">Synchros</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Selectionner ${row.companyName}`}
                    className="size-3.5"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/prospects/${row.id}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <CompanyAvatar initials={row.initials} background={row.initialsBg} />
                    <div className="min-w-0">
                      <div className="text-md-text truncate font-semibold">{row.companyName}</div>
                      <div className="text-md-text-muted truncate text-xs">{row.contactEmail}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <PoleBadge code={row.pole} />
                </td>
                <td className="px-4 py-3">{CATEGORY_LABEL[row.category]}</td>
                <td className="text-md-text px-4 py-3 text-xs font-semibold">
                  {row.pack ?? <span className="text-md-text-muted">—</span>}
                </td>
                <td className="text-md-text px-4 py-3 text-xs">{row.owner}</td>
                <td className="text-md-text px-4 py-3 text-xs">
                  {row.affiliate ?? <span className="text-md-text-muted">—</span>}
                </td>
                <td className="text-md-text px-4 py-3 text-right text-xs font-semibold">
                  {formatEur(row.amountEur)}
                </td>
                <td className="px-4 py-3">
                  <SyncBadges syncs={row.syncs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
