'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { ExternalEventBadges } from '@/components/admin/ExternalEventBadges';
import type { CompanyListItem, CategoryTarif } from '@/lib/supabase/constants';
import type { PoleCode } from '@/lib/design-tokens';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<CategoryTarif, string> = {
  prs_exhibitor: 'PRS partenaire',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

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

function formatDate(input: string | null): string {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return input.slice(0, 10);
  }
}

const columns: ColumnDef<CompanyListItem>[] = [
  {
    id: 'company',
    header: 'Société',
    size: 240,
    minSize: 180,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <Link href={`/admin/companies/${r.id}`} className="flex items-center gap-3 hover:underline">
          <CompanyAvatar initials={initialsOf(r.name)} />
          <div className="min-w-0">
            <div className="text-md-text truncate font-semibold">{r.name}</div>
            <ExternalEventBadges tags={r.external_event_tags} size="xs" />
            {r.primary_domain ? (
              <div className="text-md-text-muted truncate font-mono text-[10px]">
                {r.primary_domain}
              </div>
            ) : null}
          </div>
        </Link>
      );
    },
  },
  {
    id: 'pole',
    header: 'Pôle',
    size: 90,
    minSize: 70,
    cell: ({ row }) =>
      row.original.pole ? (
        <PoleBadge code={row.original.pole.code as PoleCode} />
      ) : (
        <span className="text-md-text-muted text-xs">—</span>
      ),
  },
  {
    id: 'city',
    header: 'Ville',
    size: 120,
    minSize: 80,
    cell: ({ row }) =>
      row.original.city ? (
        <span className="text-md-text text-xs">{row.original.city}</span>
      ) : (
        <span className="bg-md-warning/15 text-md-warning rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
          ⚠ Manquant
        </span>
      ),
  },
  {
    id: 'postal_code',
    header: 'CP',
    size: 80,
    minSize: 60,
    cell: ({ row }) => (
      <span className="text-md-text-muted font-mono text-xs">
        {row.original.postal_code ?? '—'}
      </span>
    ),
  },
  {
    id: 'country',
    header: 'Pays',
    size: 80,
    minSize: 60,
    cell: ({ row }) => <span className="text-md-text text-xs">{row.original.country ?? '—'}</span>,
  },
  {
    id: 'category',
    header: 'Catégorie',
    size: 130,
    minSize: 100,
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
          row.original.category === 'prs_exhibitor'
            ? 'bg-md-magenta/10 text-md-magenta'
            : row.original.category === 'standard'
              ? 'bg-md-blue/10 text-md-blue'
              : 'bg-muted text-md-text-muted',
        )}
      >
        {CATEGORY_LABELS[row.original.category]}
      </span>
    ),
  },
  {
    id: 'created_at',
    header: 'Import',
    size: 110,
    minSize: 80,
    cell: ({ row }) => (
      <span className="text-md-text-muted text-xs">{formatDate(row.original.created_at)}</span>
    ),
  },
  {
    id: 'prospected',
    header: 'Prospecté',
    size: 120,
    minSize: 90,
    cell: ({ row }) =>
      row.original.has_prospected_contact ? (
        <div className="leading-tight">
          <span className="text-xs font-semibold whitespace-nowrap text-emerald-700">
            ✓ Prospecté
          </span>
          {row.original.latest_prospect_owner && (
            <span className="text-md-text-muted block truncate text-[11px]">
              {row.original.latest_prospect_owner}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs font-semibold whitespace-nowrap text-amber-600">
          ⚠ À prospecter
        </span>
      ),
  },
  {
    id: 'actions',
    header: '',
    size: 80,
    minSize: 60,
    enableResizing: false,
    meta: { headerLabel: 'Actions', cellClassName: 'text-right' },
    cell: ({ row }) => (
      <Link
        href={`/admin/companies/${row.original.id}`}
        className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      >
        Voir
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    ),
  },
];

export function CompaniesListClient({ rows }: { rows: CompanyListItem[] }) {
  return (
    <AdminDataTable
      tableKey="companies"
      columns={columns}
      data={rows}
      emptyMessage="Aucune société ne correspond aux filtres."
    />
  );
}
