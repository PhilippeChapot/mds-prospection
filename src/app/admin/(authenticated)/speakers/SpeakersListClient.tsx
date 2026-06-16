'use client';

import { useMemo, useTransition, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Trash2 } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { cn } from '@/lib/utils';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import {
  SPEAKER_TYPE_LABEL,
  SPEAKER_STATUS_LABEL,
  SPEAKER_STATUS_CLASS,
  type SpeakerListItem,
  type SpeakerType,
  type SpeakerStatus,
} from '@/lib/speakers/constants';
import { confirmSpeakerAction, deleteSpeakerAction } from '@/lib/admin/speakers/mutate-actions';

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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        SPEAKER_STATUS_CLASS[status as SpeakerStatus] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {SPEAKER_STATUS_LABEL[status as SpeakerStatus] ?? status}
    </span>
  );
}

export function SpeakersListClient({
  rows,
  currentRole,
}: {
  rows: SpeakerListItem[];
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

  const columns = useMemo<ColumnDef<SpeakerListItem>[]>(
    () => [
      {
        id: 'speaker',
        header: 'Speaker',
        size: 240,
        minSize: 180,
        cell: ({ row }) => {
          const r = row.original;
          const name =
            [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(' ').trim() ||
            r.contact?.email ||
            '—';
          return (
            <Link
              href={`/admin/speakers/${r.id}`}
              className="flex items-center gap-3 hover:underline"
            >
              {r.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <CompanyAvatar initials={initialsOf(name)} />
              )}
              <div className="min-w-0">
                <div className="text-md-text truncate font-semibold">{name}</div>
                {r.contact?.email ? (
                  <div className="text-md-text-muted truncate text-xs">{r.contact.email}</div>
                ) : null}
              </div>
            </Link>
          );
        },
      },
      {
        id: 'company',
        header: 'Société',
        size: 160,
        minSize: 110,
        cell: ({ row }) =>
          row.original.company ? (
            <Link
              href={`/admin/companies/${row.original.company.id}`}
              className="text-md-blue truncate text-xs font-medium hover:underline"
            >
              {row.original.company.name}
            </Link>
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
            {row.original.speaker_type
              ? (SPEAKER_TYPE_LABEL[row.original.speaker_type as SpeakerType] ??
                row.original.speaker_type)
              : '—'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Statut',
        size: 110,
        minSize: 90,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'topics',
        header: 'Topics',
        size: 180,
        minSize: 120,
        cell: ({ row }) => {
          const ts = row.original.topics ?? [];
          if (ts.length === 0) return <span className="text-md-text-muted text-xs">—</span>;
          const shown = ts.slice(0, 2);
          return (
            <span className="text-md-text-muted text-xs">
              {shown.join(', ')}
              {ts.length > 2 ? ` +${ts.length - 2}` : ''}
            </span>
          );
        },
      },
      {
        id: 'conferences',
        header: 'Conf.',
        size: 70,
        minSize: 55,
        cell: ({ row }) => (
          <span className="text-md-text text-xs font-semibold">
            {row.original.conference_count}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        size: 120,
        minSize: 90,
        cell: ({ row }) => (
          <span className="text-md-text text-xs">{row.original.owner?.full_name ?? '—'}</span>
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
                href={`/admin/speakers/${r.id}`}
                className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                Voir <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
              {r.status !== 'confirmed' ? (
                <button
                  type="button"
                  title="Confirmer"
                  disabled={pending && busyId === r.id}
                  onClick={() => run(r.id, () => confirmSpeakerAction(r.id), 'Speaker confirmé.')}
                  className="text-md-success inline-flex items-center disabled:opacity-40"
                >
                  <Check className="size-4" aria-hidden />
                </button>
              ) : null}
              {isSuperAdmin(currentRole) ? (
                <button
                  type="button"
                  title="Supprimer"
                  disabled={pending && busyId === r.id}
                  onClick={() => {
                    if (window.confirm('Supprimer ce speaker ?'))
                      run(r.id, () => deleteSpeakerAction(r.id), 'Speaker supprimé.');
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
      tableKey="speakers"
      columns={columns}
      data={rows}
      emptyMessage="Aucun speaker ne correspond aux filtres."
    />
  );
}
