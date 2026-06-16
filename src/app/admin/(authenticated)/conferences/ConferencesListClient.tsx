'use client';

import { useMemo, useTransition, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import { formatParisDateTime } from '@/lib/format/dates';
import {
  CONFERENCE_TYPE_LABEL,
  type ConferenceListItem,
  type ConferenceType,
} from '@/lib/conferences/constants';
import {
  publishConferenceAction,
  deleteConferenceAction,
} from '@/lib/admin/conferences/crud-actions';

export function ConferencesListClient({
  rows,
  currentRole,
}: {
  rows: ConferenceListItem[];
  currentRole: 'admin' | 'sales' | 'super_admin';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await fn();
        toast.success(okMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      } finally {
        setBusyId(null);
      }
    });
  }

  const columns = useMemo<ColumnDef<ConferenceListItem>[]>(
    () => [
      {
        id: 'title',
        header: 'Titre',
        size: 260,
        minSize: 180,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Link href={`/admin/conferences/${r.id}`} className="block hover:underline">
              <div className="text-md-text flex items-center gap-1.5 font-semibold">
                {r.featured ? <span title="Featured">⭐</span> : null}
                <span className="truncate">{r.title_fr}</span>
              </div>
              {r.title_en ? (
                <div className="text-md-text-muted truncate text-xs">{r.title_en}</div>
              ) : null}
            </Link>
          );
        },
      },
      {
        id: 'type',
        header: 'Type',
        size: 100,
        minSize: 80,
        cell: ({ row }) => (
          <span className="text-md-text text-xs">
            {row.original.conference_type
              ? (CONFERENCE_TYPE_LABEL[row.original.conference_type as ConferenceType] ??
                row.original.conference_type)
              : '—'}
          </span>
        ),
      },
      {
        id: 'slot',
        header: 'Date & heure',
        size: 160,
        minSize: 120,
        cell: ({ row }) => (
          <span className="text-md-text-muted text-xs">
            {row.original.start_at
              ? formatParisDateTime(row.original.start_at, 'fr', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '—'}
          </span>
        ),
      },
      {
        id: 'room',
        header: 'Salle',
        size: 110,
        minSize: 70,
        cell: ({ row }) => <span className="text-md-text text-xs">{row.original.room ?? '—'}</span>,
      },
      {
        id: 'city',
        header: 'Ville',
        size: 100,
        minSize: 70,
        cell: ({ row }) => <span className="text-md-text text-xs">{row.original.city ?? '—'}</span>,
      },
      {
        id: 'speakers',
        header: 'Speakers',
        size: 80,
        minSize: 60,
        cell: ({ row }) => (
          <span className="text-md-text text-xs font-semibold">{row.original.speaker_count}</span>
        ),
      },
      {
        id: 'capacity',
        header: 'Capacité',
        size: 80,
        minSize: 60,
        cell: ({ row }) => (
          <span className="text-md-text-muted text-xs">{row.original.capacity ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: 'Statut',
        size: 100,
        minSize: 80,
        cell: ({ row }) =>
          row.original.is_published ? (
            <span className="bg-md-success/15 text-md-success rounded-full px-2.5 py-1 text-[11px] font-semibold">
              Publiée
            </span>
          ) : (
            <span className="bg-md-warning/15 text-md-warning rounded-full px-2.5 py-1 text-[11px] font-semibold">
              Brouillon
            </span>
          ),
      },
      {
        id: 'actions',
        header: '',
        meta: { headerLabel: 'Actions', cellClassName: 'text-right' },
        size: 150,
        minSize: 120,
        enableResizing: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Link
                href={`/admin/conferences/${r.id}`}
                className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                Voir <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
              <button
                type="button"
                title={r.is_published ? 'Dépublier' : 'Publier'}
                disabled={pending && busyId === r.id}
                onClick={() =>
                  run(
                    r.id,
                    () => publishConferenceAction(r.id, !r.is_published),
                    r.is_published ? 'Dépubliée.' : 'Publiée.',
                  )
                }
                className="text-md-text-muted hover:text-md-blue inline-flex items-center disabled:opacity-40"
              >
                {r.is_published ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
              {isSuperAdmin(currentRole) ? (
                <button
                  type="button"
                  title="Supprimer"
                  disabled={pending && busyId === r.id}
                  onClick={() => {
                    if (window.confirm('Supprimer cette conférence ?'))
                      run(r.id, () => deleteConferenceAction(r.id), 'Supprimée.');
                  }}
                  className="text-md-text-muted hover:text-md-danger inline-flex items-center disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, busyId, currentRole],
  );

  return (
    <AdminDataTable
      tableKey="conferences"
      columns={columns}
      data={rows}
      emptyMessage="Aucune conférence ne correspond aux filtres."
    />
  );
}
