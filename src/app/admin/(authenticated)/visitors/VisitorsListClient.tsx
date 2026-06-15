'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Phone, Smartphone, Trash2 } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { formatPhoneForDisplay } from '@/lib/utils/phone-format';
import { cn } from '@/lib/utils';
import type { PoleCode } from '@/lib/design-tokens';
import {
  VISITOR_STATUS_LABEL,
  VISITOR_STATUS_CLASS,
  VISITOR_TYPE_LABEL,
  VISITOR_LANGUAGE_LABEL,
  type VisitorListItem,
  type VisitorStatus,
  type VisitorType,
  type VisitorLanguage,
} from '@/lib/visitors/constants';
import { deleteVisitorAction } from '@/lib/admin/visitors/mutate-actions';

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

function VisitorStatusPill({ status }: { status: string }) {
  const cls = VISITOR_STATUS_CLASS[status as VisitorStatus] ?? 'bg-slate-100 text-slate-700';
  const label = VISITOR_STATUS_LABEL[status as VisitorStatus] ?? status;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        cls,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

export function VisitorsListClient({ rows }: { rows: VisitorListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`Supprimer le visiteur « ${label} » ? Cette action est définitive.`)) {
      return;
    }
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteVisitorAction(id);
        toast.success('Visiteur supprimé.');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur suppression');
      } finally {
        setDeletingId(null);
      }
    });
  }

  const columns = useMemo<ColumnDef<VisitorListItem>[]>(
    () => [
      {
        id: 'visitor',
        header: 'Visiteur',
        size: 250,
        minSize: 190,
        cell: ({ row }) => {
          const r = row.original;
          const name =
            [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(' ').trim() ||
            r.contact?.email ||
            '—';
          return (
            <Link
              href={`/admin/visitors/${r.id}`}
              className="flex items-center gap-3 hover:underline"
            >
              <CompanyAvatar initials={initialsOf(name)} />
              <div className="min-w-0">
                <div className="text-md-text truncate font-semibold">{name}</div>
                {r.contact?.email ? (
                  <div className="text-md-text-muted truncate text-xs">{r.contact.email}</div>
                ) : null}
                {r.contact?.phone_mobile ? (
                  <span className="text-md-text-muted inline-flex items-center gap-1 text-[11px]">
                    <Smartphone className="size-3" aria-hidden />
                    {formatPhoneForDisplay(r.contact.phone_mobile)}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        },
      },
      {
        id: 'company',
        header: 'Société',
        size: 180,
        minSize: 120,
        cell: ({ row }) => {
          const c = row.original.company;
          return c ? (
            <Link
              href={`/admin/companies/${c.id}`}
              className="text-md-blue truncate text-xs font-medium hover:underline"
            >
              {c.name}
            </Link>
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          );
        },
      },
      {
        id: 'pole',
        header: 'Pôle',
        size: 100,
        minSize: 70,
        cell: ({ row }) =>
          row.original.pole ? (
            <PoleBadge code={row.original.pole as PoleCode} />
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          ),
      },
      {
        id: 'type',
        header: 'Type',
        size: 110,
        minSize: 80,
        cell: ({ row }) => (
          <span className="text-md-text text-xs">
            {row.original.visitor_type
              ? (VISITOR_TYPE_LABEL[row.original.visitor_type as VisitorType] ??
                row.original.visitor_type)
              : '—'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Statut',
        size: 110,
        minSize: 90,
        cell: ({ row }) => <VisitorStatusPill status={row.original.status} />,
      },
      {
        id: 'vip',
        header: 'VIP',
        size: 70,
        minSize: 55,
        cell: ({ row }) =>
          row.original.is_vip ? (
            <span title="VIP" className="text-sm">
              🌟
            </span>
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          ),
      },
      {
        id: 'bigco',
        header: 'Big Co',
        size: 75,
        minSize: 55,
        cell: ({ row }) =>
          row.original.is_big_company ? (
            <span title="Grand compte (>1000 employés)" className="text-sm">
              🐳
            </span>
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          ),
      },
      {
        id: 'lang',
        header: 'Langue',
        size: 90,
        minSize: 65,
        cell: ({ row }) => (
          <span className="text-md-text text-xs">
            {VISITOR_LANGUAGE_LABEL[row.original.language as VisitorLanguage] ??
              row.original.language}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        size: 130,
        minSize: 90,
        cell: ({ row }) => {
          const o = row.original.owner;
          return (
            <span className="text-md-text text-xs">{o?.full_name?.trim() || o?.email || '—'}</span>
          );
        },
      },
      {
        id: 'brevo',
        header: 'Brevo',
        size: 85,
        minSize: 65,
        cell: ({ row }) =>
          row.original.brevo_synced_at ? (
            <span className="text-xs text-emerald-600">✅ sync</span>
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          ),
      },
      {
        id: 'created_at',
        header: 'Ajout',
        size: 110,
        minSize: 80,
        cell: ({ row }) => (
          <span className="text-md-text-muted text-xs">{formatDate(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { headerLabel: 'Actions', cellClassName: 'text-right' },
        size: 160,
        minSize: 120,
        enableResizing: false,
        cell: ({ row }) => {
          const r = row.original;
          const label =
            [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(' ').trim() ||
            r.contact?.email ||
            'visiteur';
          return (
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Link
                href={`/admin/visitors/${r.id}`}
                className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                Voir
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(r.id, label)}
                disabled={pending && deletingId === r.id}
                title="Supprimer"
                className="text-md-text-muted hover:text-md-danger inline-flex items-center disabled:opacity-40"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        },
      },
    ],
    // handleDelete closes over pending/deletingId; rebuild when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, deletingId],
  );

  return (
    <AdminDataTable
      tableKey="visitors"
      columns={columns}
      data={rows}
      emptyMessage="Aucun visiteur ne correspond aux filtres."
    />
  );
}
