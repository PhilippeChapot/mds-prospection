'use client';

import { useMemo, useTransition, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Eye, EyeOff, Trash2, BadgeCheck } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { Button } from '@/components/ui/button';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import { formatParisDateTime, formatParisDate } from '@/lib/format/dates';
import {
  CONFERENCE_TYPE_LABEL,
  type ConferenceListItem,
  type ConferenceType,
} from '@/lib/conferences/constants';
import {
  publishConferenceAction,
  deleteConferenceAction,
} from '@/lib/admin/conferences/crud-actions';
import { bulkValidateConferencesAction } from '@/lib/admin/programs/validation-actions';

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
        const res = await bulkValidateConferencesAction(ids);
        toast.success(`${res.updated} conférence(s) validée(s).`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  const columns = useMemo<ColumnDef<ConferenceListItem>[]>(() => {
    const cols: ColumnDef<ConferenceListItem>[] = [];

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
            aria-label="Tout sélectionner (non validées)"
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
        id: 'title',
        header: 'Titre',
        size: 240,
        minSize: 160,
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
        id: 'validation',
        header: 'Import',
        size: 180,
        minSize: 110,
        cell: ({ row }) =>
          row.original.is_validated ? (
            <span className="text-md-text-muted inline-flex items-center gap-1 text-xs">
              <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden /> Validée
            </span>
          ) : (
            <span className="bg-md-warning/15 text-md-warning inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
              ⚠️ Importé non validé
              {row.original.imported_at ? ` · ${formatParisDate(row.original.imported_at)}` : ''}
            </span>
          ),
      },
      {
        id: 'type',
        header: 'Type',
        size: 90,
        minSize: 70,
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
        size: 150,
        minSize: 110,
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
        id: 'city',
        header: 'Ville',
        size: 90,
        minSize: 60,
        cell: ({ row }) => <span className="text-md-text text-xs">{row.original.city ?? '—'}</span>,
      },
      {
        id: 'speakers',
        header: 'Speakers',
        size: 70,
        minSize: 55,
        cell: ({ row }) => (
          <span className="text-md-text text-xs font-semibold">{row.original.speaker_count}</span>
        ),
      },
      {
        id: 'status',
        header: 'Statut',
        size: 90,
        minSize: 80,
        cell: ({ row }) =>
          row.original.is_published ? (
            <span className="bg-md-success/15 text-md-success rounded-full px-2.5 py-1 text-[11px] font-semibold">
              Publiée
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              Brouillon
            </span>
          ),
      },
      {
        id: 'actions',
        header: '',
        meta: { headerLabel: 'Actions', cellClassName: 'text-right' },
        size: 140,
        minSize: 110,
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
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busyId, currentRole, selected, unvalidatedIds, canBulk, toggleAll, toggleOne]);

  return (
    <div className="space-y-3">
      <AdminDataTable
        tableKey="conferences"
        columns={columns}
        data={rows}
        emptyMessage="Aucune conférence ne correspond aux filtres."
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
