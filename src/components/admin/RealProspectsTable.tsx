import Link from 'next/link';
import { CompanyAvatar } from './CompanyAvatar';
import { PoleBadge } from './PoleBadge';
import { StatusPill } from './StatusPill';
import { PACK_LABEL, type ProspectListItem } from '@/lib/supabase/queries';
import type { PoleCode } from '@/lib/design-tokens';

function initialsOf(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatEur(value: number | null) {
  if (value === null) return '—';
  return `${Math.round(value).toLocaleString('fr-FR')} €`;
}

const CATEGORY_BADGE: Record<
  ProspectListItem['company'] extends infer C
    ? C extends { category: infer K }
      ? K & string
      : never
    : never,
  React.ReactNode
> = {
  prs_exhibitor: <strong className="text-md-magenta text-[11px]">PRS</strong>,
  standard: <span className="text-md-text-muted text-xs">Standard</span>,
  non_eligible: <span className="text-md-text-muted text-xs">Non eligible</span>,
};

export function RealProspectsTable({ rows }: { rows: ProspectListItem[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border-md-border rounded-xl border p-12 text-center shadow-sm">
        <p className="text-md-text font-semibold">Aucun prospect ne correspond aux filtres.</p>
        <p className="text-md-text-muted mt-2 text-sm">
          Modifiez vos filtres ou{' '}
          <Link href="/admin/prospects/new" className="text-md-blue underline">
            creez un premier prospect
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Societe / Contact</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Pole</th>
              <th className="px-4 py-3">Categorie</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">€ HT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const contactName = row.contact
                ? [row.contact.first_name, row.contact.last_name].filter(Boolean).join(' ').trim()
                : '';
              const contactDisplay = contactName || row.contact?.email || '—';
              const ownerDisplay =
                row.owner?.full_name?.trim() || row.owner?.email || (row.owner_id ? '—' : '—');
              return (
                <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/prospects/${row.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <CompanyAvatar initials={initialsOf(row.company?.name ?? '?')} />
                      <div className="min-w-0">
                        <div className="text-md-text truncate font-semibold">
                          {row.company?.name ?? 'Societe inconnue'}
                        </div>
                        <div className="text-md-text-muted truncate text-xs">{contactDisplay}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.company?.pole ? (
                      <PoleBadge code={row.company.pole.code as PoleCode} />
                    ) : (
                      <span className="text-md-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.company ? CATEGORY_BADGE[row.company.category] : null}
                  </td>
                  <td className="text-md-text px-4 py-3 text-xs font-semibold">
                    {row.pack_code === 'A_DEFINIR' ? (
                      <span className="text-md-text-muted">—</span>
                    ) : (
                      PACK_LABEL[row.pack_code]
                    )}
                  </td>
                  <td className="text-md-text px-4 py-3 text-xs">{ownerDisplay}</td>
                  <td className="text-md-text px-4 py-3 text-right text-xs font-semibold">
                    {formatEur(row.estimated_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
