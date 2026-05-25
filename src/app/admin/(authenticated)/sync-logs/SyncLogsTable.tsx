'use client';

/**
 * P4.x.1 — Table sync_logs + Sheet détail payload.
 *
 * Pas d'action admin destructive ici : lecture seule. Le détail charge le
 * row complet (avec payload jsonb potentiellement gros) via une server
 * action séparée pour ne pas alourdir le SSR initial.
 */

import { useState, useTransition } from 'react';
import { Eye, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { formatDateTimeShortFr } from '@/lib/format/dates';
import { getSyncLogDetailAction } from '@/lib/admin/sync-logs/actions';
import type { SyncLogRow, SyncTarget, SyncStatus } from '@/lib/admin/sync-logs/queries';

const TARGET_BADGE: Record<SyncTarget, string> = {
  sellsy: 'bg-violet-100 text-violet-800 ring-violet-300',
  stripe: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
  brevo: 'bg-sky-100 text-sky-800 ring-sky-300',
  connectonair: 'bg-amber-100 text-amber-800 ring-amber-300',
};

const STATUS_BADGE: Record<SyncStatus, string> = {
  success: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  pending: 'bg-amber-100 text-amber-800 ring-amber-300',
  error: 'bg-red-100 text-red-800 ring-red-300',
};

const STATUS_ICON: Record<SyncStatus, string> = {
  success: '✅',
  pending: '⏳',
  error: '❌',
};

export function SyncLogsTable({ rows }: { rows: SyncLogRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyncLogRow | null>(null);
  const [loading, startLoad] = useTransition();

  function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    startLoad(async () => {
      const r = await getSyncLogDetailAction({ id });
      if (r.ok) {
        setDetail(r.data);
      } else {
        toast.error(r.error);
        setSelectedId(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="border-md-border text-md-text-muted bg-card rounded-xl border p-10 text-center text-sm">
        Aucun log ne correspond aux filtres.
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Heure</th>
                <th className="px-4 py-3">Intégration</th>
                <th className="px-4 py-3">Op</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3">Entité</th>
                <th className="px-4 py-3">Erreur</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-md-border hover:bg-muted/20 cursor-pointer border-t"
                  onClick={() => openDetail(row.id)}
                >
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                    {formatDateTimeShortFr(row.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block rounded px-2 py-0.5 text-[10px] font-semibold ring-1',
                        TARGET_BADGE[row.target],
                      )}
                    >
                      {row.target}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.operation}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={cn(
                        'inline-block rounded px-2 py-0.5 text-[10px] font-semibold ring-1',
                        STATUS_BADGE[row.status],
                      )}
                      title={row.status}
                    >
                      {STATUS_ICON[row.status]} {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="text-md-text">{row.entity_type}</div>
                    <code className="text-md-text-muted text-[10px]" title={row.entity_id}>
                      {row.entity_id.slice(0, 8)}…
                    </code>
                  </td>
                  <td className="text-md-danger max-w-xs truncate px-4 py-2 text-xs">
                    {row.error_message ? (
                      <span title={row.error_message}>{row.error_message.slice(0, 80)}</span>
                    ) : (
                      <span className="text-md-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(row.id);
                      }}
                      aria-label="Voir détail"
                    >
                      <Eye className="size-3.5" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="bg-background flex h-full w-full flex-col gap-0 border-l p-0 shadow-2xl sm:w-[min(900px,95vw)] sm:max-w-[900px]"
        >
          <header className="border-md-border flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <SheetTitle className="text-md-blue-dark text-lg font-bold">Détail du log</SheetTitle>
              <SheetDescription>Trace complète de l&apos;appel API externe.</SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="sm" aria-label="Fermer">
                ✕
              </Button>
            </SheetClose>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading || !detail ? (
              <div className="text-md-text-muted flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
              </div>
            ) : (
              <SyncLogDetail row={detail} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SyncLogDetail({ row }: { row: SyncLogRow }) {
  const [copied, setCopied] = useState(false);
  const payloadString = JSON.stringify(row.payload, null, 2);

  async function copyPayload() {
    await navigator.clipboard.writeText(payloadString);
    setCopied(true);
    toast.success('Payload copié.');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
          Métadonnées
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Field label="ID">
            <code className="font-mono text-[11px]">{row.id}</code>
          </Field>
          <Field label="Créé le">{formatDateTimeShortFr(row.created_at)}</Field>
          <Field label="Intégration">{row.target}</Field>
          <Field label="Opération">{row.operation}</Field>
          <Field label="Statut">
            {STATUS_ICON[row.status]} {row.status}
          </Field>
          <Field label="Type entité">{row.entity_type}</Field>
          <Field label="ID entité" wide>
            <code className="font-mono text-[11px]">{row.entity_id}</code>
          </Field>
        </dl>
      </section>

      {row.error_message ? (
        <section className="space-y-2">
          <h3 className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Message d&apos;erreur
          </h3>
          <pre className="bg-md-danger/5 border-md-danger/30 text-md-danger overflow-x-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
            {row.error_message}
          </pre>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Payload
          </h3>
          <Button variant="outline" size="sm" onClick={copyPayload}>
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        <pre className="bg-md-bg-soft border-md-border max-h-[500px] overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
          {payloadString}
        </pre>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">{label}</dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}
