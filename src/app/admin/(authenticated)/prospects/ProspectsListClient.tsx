'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Download, UserCog, Tag, Phone, Smartphone } from 'lucide-react';
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
import { PACK_LABEL, type ProspectListItem, type ProspectStatus } from '@/lib/supabase/constants';
import {
  bulkUpdateProspectsOwnerAction,
  bulkUpdateProspectsStatusAction,
  exportProspectsCsvAction,
  type ExportProspectsFilters,
} from './bulk-actions';
import type { PoleCode } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

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

  const allOnPage = rows.map((r) => r.id);
  const allSelected = allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const id of allOnPage) next.delete(id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const id of allOnPage) next.add(id);
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function handleApplyStatus() {
    const ids = [...selected];
    startTransition(async () => {
      try {
        const res = await bulkUpdateProspectsStatusAction(ids, bulkStatus);
        toast.success(`${res.updated} prospect(s) mis a jour.`);
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
        toast.success(`${res.updated} prospect(s) reassigne(s).`);
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
        toast.success(`Export telecharge : ${result.filename}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur export');
      }
    });
  }

  const exportLabel = useMemo(
    () => (someSelected ? `Exporter selection (${selected.size})` : 'Exporter CSV'),
    [someSelected, selected.size],
  );

  return (
    <div className="space-y-3">
      {/* Bar d'export + bulk actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {someSelected && (
          <span className="text-md-text mr-auto text-xs font-semibold">
            {selected.size} prospect(s) selectionne(s)
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
                Reassigner owner
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
      {rows.length === 0 ? (
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
      ) : (
        <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Tout selectionner"
                      className="size-3.5"
                    />
                  </th>
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
                    ? [row.contact.first_name, row.contact.last_name]
                        .filter(Boolean)
                        .join(' ')
                        .trim()
                    : '';
                  const contactDisplay = contactName || row.contact?.email || '—';
                  const ownerDisplay = row.owner?.full_name?.trim() || row.owner?.email || '—';
                  const isChecked = selected.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-md-border hover:bg-muted/30 border-t',
                        isChecked && 'bg-md-magenta/5',
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Selectionner ${row.company?.name ?? 'prospect'}`}
                          className="size-3.5"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/prospects/${row.id}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <CompanyAvatar initials={initialsOf(row.company?.name ?? '?')} />
                          <div className="min-w-0">
                            <div className="text-md-text flex items-center gap-1.5 truncate font-semibold">
                              <span className="truncate">
                                {row.company?.name ?? 'Societe inconnue'}
                              </span>
                              {row.is_test && (
                                <span
                                  className="bg-md-warning/15 text-md-warning shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
                                  title="Mode test : syncs externes desactivees"
                                >
                                  TEST
                                </span>
                              )}
                              {row.company?.phone ? (
                                <a
                                  href={`tel:${row.company.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-md-text-muted hover:text-md-blue ml-1 inline-flex shrink-0 items-center gap-1 text-[11px] font-normal"
                                  title="Appeler la société"
                                >
                                  <Phone className="size-3" aria-hidden />
                                  {formatPhoneForDisplay(row.company.phone)}
                                </a>
                              ) : null}
                            </div>
                            <div className="text-md-text-muted flex flex-wrap items-center gap-2 truncate text-xs">
                              <span className="truncate">{contactDisplay}</span>
                              {row.contact?.phone_mobile ? (
                                <a
                                  href={`tel:${row.contact.phone_mobile}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:text-md-blue inline-flex items-center gap-1 text-[11px]"
                                  title="Appeler le mobile"
                                >
                                  <Smartphone className="size-3" aria-hidden />
                                  {formatPhoneForDisplay(row.contact.phone_mobile)}
                                </a>
                              ) : null}
                            </div>
                            {row.company?.external_event_tags ? (
                              <div className="mt-1">
                                <ExternalEventBadges
                                  tags={row.company.external_event_tags}
                                  size="xs"
                                />
                              </div>
                            ) : null}
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
                      <td className="px-4 py-3 text-xs">
                        {row.company ? CATEGORY_LABEL[row.company.category] : null}
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
      )}

      {/* Dialog : changer statut */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le statut</DialogTitle>
            <DialogDescription>
              {selected.size} prospect(s) seront mis a jour. Operation tracee dans l&apos;audit log.
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

      {/* Dialog : reassigner owner (admin only) */}
      {hasAdminAccess(currentRole) && (
        <Dialog open={ownerOpen} onOpenChange={setOwnerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reassigner l&apos;owner</DialogTitle>
              <DialogDescription>
                {selected.size} prospect(s) seront reassignes a un autre commercial.
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
