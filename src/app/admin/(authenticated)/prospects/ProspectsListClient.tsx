'use client';

import { useMemo, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { Download, UserCog, Tag, Phone, Smartphone } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { formatPhoneForDisplay } from '@/lib/utils/phone-format';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { ExternalEventBadges } from '@/components/admin/ExternalEventBadges';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { StatusPill } from '@/components/admin/StatusPill';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { PACK_LABEL, type ProspectListItem, type ProspectStatus } from '@/lib/supabase/constants';
import {
  bulkUpdateProspectsOwnerAction,
  bulkUpdateProspectsStatusAction,
  exportProspectsCsvAction,
  type ExportProspectsFilters,
} from './bulk-actions';
import type { PoleCode } from '@/lib/design-tokens';

type Owner = { id: string; label: string };

const CATEGORY_LABEL: Record<
  ProspectListItem['company'] extends infer C
    ? C extends { category: infer K }
      ? K & string
      : never
    : never,
  string
> = {
  prs_exhibitor: 'PRS',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'En contact' },
  { value: 'devis_envoye', label: 'Devis envoye' },
  { value: 'acompte_paye', label: 'Acompte paye' },
  { value: 'signe', label: 'Signe' },
  { value: 'perdu', label: 'Perdu' },
];

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

function formatEur(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value).toLocaleString('fr-FR')} €`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Static column definitions (no selection state needed).
const STATIC_COLUMNS: ColumnDef<ProspectListItem>[] = [
  {
    id: 'company_contact',
    header: 'Société / Contact',
    size: 260,
    minSize: 200,
    cell: ({ row }) => {
      const r = row.original;
      const contactName = r.contact
        ? [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ').trim()
        : '';
      const contactDisplay = contactName || r.contact?.email || '—';
      return (
        <Link href={`/admin/prospects/${r.id}`} className="flex items-center gap-3 hover:underline">
          <CompanyAvatar initials={initialsOf(r.company?.name ?? '?')} />
          <div className="min-w-0">
            <div className="text-md-text flex items-center gap-1.5 truncate font-semibold">
              <span className="truncate">{r.company?.name ?? 'Société inconnue'}</span>
              {r.is_test && (
                <span
                  className="bg-md-warning/15 text-md-warning shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
                  title="Mode test : syncs externes désactivées"
                >
                  TEST
                </span>
              )}
              {r.company?.phone ? (
                <a
                  href={`tel:${r.company.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-md-text-muted hover:text-md-blue ml-1 inline-flex shrink-0 items-center gap-1 text-[11px] font-normal"
                  title="Appeler la société"
                >
                  <Phone className="size-3" aria-hidden />
                  {formatPhoneForDisplay(r.company.phone)}
                </a>
              ) : null}
            </div>
            <div className="text-md-text-muted flex flex-wrap items-center gap-2 truncate text-xs">
              <span className="truncate">{contactDisplay}</span>
              {r.contact?.phone_mobile ? (
                <a
                  href={`tel:${r.contact.phone_mobile}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-md-blue inline-flex items-center gap-1 text-[11px]"
                  title="Appeler le mobile"
                >
                  <Smartphone className="size-3" aria-hidden />
                  {formatPhoneForDisplay(r.contact.phone_mobile)}
                </a>
              ) : null}
            </div>
            {r.company?.external_event_tags ? (
              <div className="mt-1">
                <ExternalEventBadges tags={r.company.external_event_tags} size="xs" />
              </div>
            ) : null}
          </div>
        </Link>
      );
    },
  },
  {
    id: 'status',
    header: 'Statut',
    size: 110,
    minSize: 80,
    cell: ({ row }) => <StatusPill status={row.original.status} />,
  },
  {
    id: 'pole',
    header: 'Pôle',
    size: 90,
    minSize: 70,
    cell: ({ row }) =>
      row.original.company?.pole ? (
        <PoleBadge code={row.original.company.pole.code as PoleCode} />
      ) : (
        <span className="text-md-text-muted text-xs">—</span>
      ),
  },
  {
    id: 'category',
    header: 'Catégorie',
    size: 100,
    minSize: 80,
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.company ? CATEGORY_LABEL[row.original.company.category] : '—'}
      </span>
    ),
  },
  {
    id: 'pack',
    header: 'Pack',
    size: 85,
    minSize: 65,
    cell: ({ row }) =>
      row.original.pack_code === 'A_DEFINIR' ? (
        <span className="text-md-text-muted text-xs">—</span>
      ) : (
        <span className="text-md-text text-xs font-semibold">
          {PACK_LABEL[row.original.pack_code]}
        </span>
      ),
  },
  {
    id: 'owner',
    header: 'Owner',
    size: 120,
    minSize: 90,
    cell: ({ row }) => {
      const r = row.original;
      const ownerDisplay = r.owner?.full_name?.trim() || r.owner?.email || '—';
      return <span className="text-md-text text-xs">{ownerDisplay}</span>;
    },
  },
  {
    id: 'amount',
    header: '€ HT',
    size: 90,
    minSize: 70,
    meta: { cellClassName: 'text-right px-4 py-3' },
    cell: ({ row }) => (
      <span className="text-md-text text-xs font-semibold">
        {formatEur(row.original.estimated_amount)}
      </span>
    ),
  },
];

export function ProspectsListClient({
  rows,
  owners,
  currentRole,
  filters,
}: {
  rows: ProspectListItem[];
  owners: Owner[];
  currentRole: 'admin' | 'sales' | 'super_admin';
  filters: ExportProspectsFilters;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusOpen, setStatusOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ProspectStatus>('contact');
  const [bulkOwner, setBulkOwner] = useState<string>(owners[0]?.id ?? '');
  const [pending, startTransition] = useTransition();

  const someSelected = selected.size > 0;
  const exportLabel = selected.size > 0 ? `Exporter selection (${selected.size})` : 'Exporter CSV';

  // Stable handlers via functional state updates (no deps on `selected`).
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allIds = rows.map((r) => r.id);
      const next = new Set(prev);
      const allChecked = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allChecked) {
        for (const id of allIds) next.delete(id);
      } else {
        for (const id of allIds) next.add(id);
      }
      return next;
    });
  }, [rows]);

  // Columns include the select column which captures selection state via closure.
  const columns = useMemo<ColumnDef<ProspectListItem>[]>(() => {
    const allIds = rows.map((r) => r.id);
    const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

    const selectCol: ColumnDef<ProspectListItem> = {
      id: 'select',
      enableHiding: false,
      enableResizing: false,
      size: 48,
      minSize: 48,
      maxSize: 48,
      meta: { headerLabel: 'Sélection', cellClassName: 'px-3 py-3' },
      header: () => (
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          aria-label="Tout sélectionner"
          className="size-3.5"
        />
      ),
      cell: ({ row }) => {
        const isChecked = selected.has(row.original.id);
        return (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleOne(row.original.id)}
            aria-label={`Sélectionner ${row.original.company?.name ?? 'prospect'}`}
            className="size-3.5"
          />
        );
      },
    };

    return [selectCol, ...STATIC_COLUMNS];
  }, [selected, rows, toggleAll, toggleOne]);

  function handleApplyStatus() {
    const ids = [...selected];
    startTransition(async () => {
      try {
        const res = await bulkUpdateProspectsStatusAction(ids, bulkStatus);
        toast.success(`${res.updated} prospect(s) mis à jour.`);
        setSelected(new Set());
        setStatusOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur batch');
      }
    });
  }

  function handleApplyOwner() {
    const ids = [...selected];
    startTransition(async () => {
      try {
        const res = await bulkUpdateProspectsOwnerAction(ids, bulkOwner);
        toast.success(`${res.updated} prospect(s) réassigné(s).`);
        setSelected(new Set());
        setOwnerOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur batch');
      }
    });
  }

  function handleExport(useSelection: boolean) {
    startTransition(async () => {
      try {
        const result = await exportProspectsCsvAction(
          useSelection ? { ids: [...selected] } : filters,
        );
        downloadCsv(result.csv, result.filename);
        toast.success(`Export téléchargé : ${result.filename}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur export');
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Bar d'export + bulk actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {someSelected && (
          <span className="text-md-text mr-auto text-xs font-semibold">
            {selected.size} prospect(s) sélectionné(s)
          </span>
        )}

        {someSelected && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusOpen(true)}
              disabled={pending}
            >
              <Tag className="size-4" aria-hidden />
              Changer statut
            </Button>
            {hasAdminAccess(currentRole) && owners.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOwnerOpen(true)}
                disabled={pending}
              >
                <UserCog className="size-4" aria-hidden />
                Réassigner owner
              </Button>
            ) : null}
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport(someSelected)}
          disabled={pending || rows.length === 0}
        >
          <Download className="size-4" aria-hidden />
          {pending ? 'Export…' : exportLabel}
        </Button>
      </div>

      {/* Table */}
      <AdminDataTable
        tableKey="prospects"
        columns={columns}
        data={rows}
        emptyMessage="Aucun prospect ne correspond aux filtres."
        getRowClassName={(row) => (selected.has(row.id) ? 'bg-md-magenta/5' : '')}
      />

      {/* Dialog : changer statut */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le statut</DialogTitle>
            <DialogDescription>
              {selected.size} prospect(s) seront mis à jour. Opération tracée dans l&apos;audit log.
            </DialogDescription>
          </DialogHeader>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ProspectStatus)}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button onClick={handleApplyStatus} disabled={pending}>
              {pending ? 'Application…' : 'Appliquer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : réassigner owner (admin only) */}
      {hasAdminAccess(currentRole) && (
        <Dialog open={ownerOpen} onOpenChange={setOwnerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Réassigner l&apos;owner</DialogTitle>
              <DialogDescription>
                {selected.size} prospect(s) seront réassignés à un autre commercial.
              </DialogDescription>
            </DialogHeader>
            <select
              value={bulkOwner}
              onChange={(e) => setBulkOwner(e.target.value)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button onClick={handleApplyOwner} disabled={pending || !bulkOwner}>
                {pending ? 'Application…' : 'Appliquer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
