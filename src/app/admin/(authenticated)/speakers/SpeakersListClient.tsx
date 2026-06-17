'use client';

import { useMemo, useTransition, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Trash2, BadgeCheck } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { Button } from '@/components/ui/button';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { cn } from '@/lib/utils';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import { formatParisDate } from '@/lib/format/dates';
import {
  SPEAKER_TYPE_LABEL,
  SPEAKER_STATUS_LABEL,
  SPEAKER_STATUS_CLASS,
  type SpeakerListItem,
  type SpeakerType,
  type SpeakerStatus,
} from '@/lib/speakers/constants';
import { confirmSpeakerAction, deleteSpeakerAction } from '@/lib/admin/speakers/mutate-actions';
import { bulkValidateSpeakersAction } from '@/lib/admin/programs/validation-actions';

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canBulk = isSuperAdmin(currentRole);

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

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const unvalidatedIds = useMemo(
    () => rows.filter((r) => !r.is_validated).map((r) => r.id),
    [rows],
  );
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allChecked = unvalidatedIds.length > 0 && unvalidatedIds.every((id) => prev.has(id));
      return allChecked ? new Set() : new Set(unvalidatedIds);
    });
  }, [unvalidatedIds]);

  function bulkValidate() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkValidateSpeakersAction(ids);
        toast.success(`${res.updated} speaker(s) validé(s).`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  const columns = useMemo<ColumnDef<SpeakerListItem>[]>(() => {
    const cols: ColumnDef<SpeakerListItem>[] = [];

    if (canBulk) {
      const allChecked =
        unvalidatedIds.length > 0 && unvalidatedIds.every((id) => selected.has(id));
      cols.push({
        id: 'select',
        enableHiding: false,
        enableResizing: false,
        size: 44,
        minSize: 44,
        maxSize: 44,
        meta: { headerLabel: 'Sélection' },
        header: () => (
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            aria-label="Tout sélectionner (non validés)"
            className="size-3.5"
          />
        ),
        cell: ({ row }) =>
          row.original.is_validated ? null : (
            <input
              type="checkbox"
              checked={selected.has(row.original.id)}
              onChange={() => toggleOne(row.original.id)}
              aria-label="Sélectionner"
              className="size-3.5"
            />
          ),
      });
    }

    cols.push(
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
        id: 'validation',
        header: 'Import',
        size: 190,
        minSize: 120,
        cell: ({ row }) =>
          row.original.is_validated ? (
            <span className="text-md-text-muted inline-flex items-center gap-1 text-xs">
              <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden /> Validé
            </span>
          ) : (
            <span className="bg-md-warning/15 text-md-warning inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
              ⚠️ Importé non validé
              {row.original.imported_at ? ` · ${formatParisDate(row.original.imported_at)}` : ''}
            </span>
          ),
      },
      {
        id: 'company',
        header: 'Société',
        size: 150,
        minSize: 100,
        cell: ({ row }) =>
          row.original.company ? (
            <span className="text-md-text truncate text-xs">{row.original.company.name}</span>
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          ),
      },
      {
        id: 'type',
        header: 'Type',
        size: 100,
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
        size: 100,
        minSize: 90,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'conferences',
        header: 'Conf.',
        size: 60,
        minSize: 50,
        cell: ({ row }) => (
          <span className="text-md-text text-xs font-semibold">
            {row.original.conference_count}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { headerLabel: 'Actions', cellClassName: 'text-right' },
        size: 130,
        minSize: 100,
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
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busyId, currentRole, selected, unvalidatedIds, canBulk, toggleAll, toggleOne]);

  return (
    <div className="space-y-3">
      <AdminDataTable
        tableKey="speakers"
        columns={columns}
        data={rows}
        emptyMessage="Aucun speaker ne correspond aux filtres."
        getRowClassName={(r) => (!r.is_validated ? 'bg-md-warning/[0.04]' : '')}
      />
      {canBulk && selected.size > 0 ? (
        <div className="sticky bottom-4 z-20 flex justify-center">
          <Button onClick={bulkValidate} disabled={pending} className="shadow-lg">
            <BadgeCheck className="size-4" aria-hidden />
            Valider la sélection ({selected.size})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
