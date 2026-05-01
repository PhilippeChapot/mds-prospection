import { CompanyAvatar } from './CompanyAvatar';
import { PoleBadge } from './PoleBadge';
import { StatusPill } from './StatusPill';
import { SyncBadges } from './SyncBadges';
import type { RecentActivityRow } from '@/lib/mock/dashboard-data';

export function RecentActivityTable({ rows }: { rows: RecentActivityRow[] }) {
  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Societe / Contact</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Pole</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Derniere action</th>
              <th className="px-4 py-3">Synchros</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-md-border border-t">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CompanyAvatar initials={row.initials} background={row.initialsBg} />
                    <div className="min-w-0">
                      <div className="text-md-text truncate font-semibold">{row.companyName}</div>
                      <div className="text-md-text-muted truncate text-xs">{row.contactEmail}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <PoleBadge code={row.pole} withLabel={false} />
                </td>
                <td className="text-md-text px-4 py-3 text-xs font-semibold">
                  {row.pack ?? <span className="text-md-text-muted">—</span>}
                </td>
                <td className="text-md-text-muted px-4 py-3 text-xs">{row.lastAction}</td>
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
