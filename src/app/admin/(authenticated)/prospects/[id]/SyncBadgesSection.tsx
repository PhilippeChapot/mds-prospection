'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  MinusCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resyncProspectAction, emitSellsyDocumentAction } from './actions';
import { cn } from '@/lib/utils';

type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped' | 'not-applicable' | 'not-implemented';

interface SellsyDocBadge {
  number: string | null;
  publicUrl: string | null;
  emittedAt: string | null;
}

interface Props {
  prospectId: string;
  isTest: boolean;
  hasSellsyDocument: boolean;
  /** Cas B = manifestation d'interet sans pack PRS. Affiche un label gris
   *  "N/A (Cas B)" pour Sellsy au lieu d'une erreur, et garde le bouton
   *  "Emettre devis" visible (admin peut decider d'emettre manuellement). */
  isCasB?: boolean;
  sellsy: {
    lastSyncedAt: string | null;
    errorMessage: string | null;
    errorAt: string | null;
    devis: SellsyDocBadge | null;
    proforma: SellsyDocBadge | null;
    invoice: SellsyDocBadge | null;
  };
  stripe: {
    lastSyncedAt: string | null;
  };
  brevo: {
    lastSyncedAt: string | null;
  };
  /** Render extra admin actions in the header toolbar (Payment Link dialog,
   *  futures actions M5+). Garde Sync section agnostique des helpers Stripe. */
  extraActions?: React.ReactNode;
}

export function SyncBadgesSection({
  prospectId,
  isTest,
  hasSellsyDocument,
  isCasB = false,
  sellsy,
  stripe,
  brevo,
  extraActions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [emitting, startEmit] = useTransition();

  function handleResync() {
    startTransition(async () => {
      try {
        await resyncProspectAction(prospectId);
        toast.success('Resynchronisation lancée. Refresh dans quelques secondes…');
        setTimeout(() => router.refresh(), 3000);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  function handleEmitDocument() {
    if (
      !confirm(
        "Émettre le document Sellsy (devis / proforma / facture selon le parcours de paiement) et envoyer l'email au prospect ?",
      )
    ) {
      return;
    }
    startEmit(async () => {
      try {
        const result = await emitSellsyDocumentAction(prospectId);
        if (!result.ok && result.reason === 'lock_conflict') {
          // P5.x.3 S2 : multi-clic frenetique -> 1er clic emet, 2-Ne clics
          // sont rejetes par le lock idempotence (P4.x.1 F). Toast warning
          // pour distinguer du flow nominal et eviter de paniquer l'admin.
          toast.warning(result.message);
          return;
        }
        toast.success('Document Sellsy émis. Refresh dans quelques secondes…');
        setTimeout(() => router.refresh(), 3000);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  // Cas B sans devis emis : on affiche un label "N/A" gris au lieu de
  // l'erreur "step2_payload Cas A introuvable" qui n'apporte rien a l'admin.
  // Si un devis a ete emis manuellement (sellsy.devis|proforma|invoice
  // non-null), on revient au flow normal.
  const sellsyStatus =
    isCasB && !hasSellsyDocument
      ? ('not-applicable' as SyncStatus)
      : computeStatus({ ...sellsy, isTest });
  // Si plusieurs documents existent, afficher le plus avance :
  // facture > proforma > devis. Permet a l'admin de voir le statut le
  // plus recent du parcours commercial.
  const sellsyDoc = sellsy.invoice
    ? { ...sellsy.invoice, label: 'Facture émise' }
    : sellsy.proforma
      ? { ...sellsy.proforma, label: 'Proforma émise' }
      : sellsy.devis
        ? { ...sellsy.devis, label: 'Devis émis' }
        : null;
  // Stripe + Brevo : pas encore implementes (P4 M4 et M6).
  const stripeStatus: SyncStatus = isTest
    ? 'skipped'
    : stripe.lastSyncedAt
      ? 'synced'
      : 'not-implemented';
  const brevoStatus: SyncStatus = isTest
    ? 'skipped'
    : brevo.lastSyncedAt
      ? 'synced'
      : 'not-implemented';

  return (
    <div className="bg-card border-md-border space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Synchronisations externes
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {!hasSellsyDocument && (
            <Button
              type="button"
              size="sm"
              onClick={handleEmitDocument}
              disabled={emitting || isTest}
              className="bg-md-magenta hover:bg-md-magenta-soft"
              title={
                isTest
                  ? 'Mode TEST : émission désactivée'
                  : 'Créer le devis/facture Sellsy + envoyer email au prospect'
              }
            >
              {emitting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <FileText className="size-3.5" aria-hidden />
              )}
              Émettre devis Sellsy
            </Button>
          )}
          {extraActions}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResync}
            disabled={pending || isTest}
            title={
              isTest
                ? 'Mode TEST : syncs externes désactivées'
                : 'Re-déclencher les syncs Sellsy / Brevo / Stripe'
            }
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            Resynchroniser
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <SyncBadge
          provider="Sellsy"
          status={sellsyStatus}
          lastSyncedAt={sellsy.lastSyncedAt}
          errorMessage={sellsy.errorMessage}
          errorAt={sellsy.errorAt}
          sellsyDoc={sellsyDoc}
        />
        <SyncBadge
          provider="Stripe"
          status={stripeStatus}
          lastSyncedAt={stripe.lastSyncedAt}
          notImplementedNote="P4 M4"
        />
        <SyncBadge
          provider="Brevo"
          status={brevoStatus}
          lastSyncedAt={brevo.lastSyncedAt}
          notImplementedNote="P4 M6"
        />
      </div>
    </div>
  );
}

function SyncBadge({
  provider,
  status,
  lastSyncedAt,
  errorMessage,
  errorAt,
  notImplementedNote,
  sellsyDoc,
}: {
  provider: string;
  status: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage?: string | null;
  errorAt?: string | null;
  notImplementedNote?: string;
  /** Si fourni, remplace le label "Synchronise le X" par le contexte
   *  document Sellsy emis (devis/proforma/facture) avec numero cliquable. */
  sellsyDoc?: {
    label: string;
    number: string | null;
    publicUrl: string | null;
    emittedAt: string | null;
  } | null;
}) {
  return (
    <div
      className={cn(
        'border-md-border flex items-start gap-2 rounded-md border p-2.5 text-xs',
        status === 'synced' && 'border-md-success/30 bg-md-success/5',
        status === 'error' && 'border-md-danger/40 bg-md-danger/5',
        status === 'skipped' && 'border-md-warning/30 bg-md-warning/5',
      )}
      title={errorMessage ?? undefined}
    >
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="text-md-text font-semibold">{provider}</div>
        <div
          className={cn(
            'text-md-text-muted text-[11px]',
            status === 'error' && 'text-md-danger',
            status === 'skipped' && 'text-md-warning',
          )}
        >
          {status === 'pending' && 'En attente de la 1re sync…'}
          {status === 'synced' &&
            (sellsyDoc ? (
              <>
                <span>
                  {sellsyDoc.label}
                  {sellsyDoc.emittedAt && ` le ${formatDate(sellsyDoc.emittedAt)}`}
                </span>
                {sellsyDoc.number && (
                  <div className="mt-0.5">
                    {sellsyDoc.publicUrl ? (
                      <a
                        href={sellsyDoc.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-md-magenta hover:text-md-magenta-soft font-medium underline-offset-2 hover:underline"
                      >
                        {sellsyDoc.number}
                      </a>
                    ) : (
                      <span className="text-md-text font-medium">{sellsyDoc.number}</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              lastSyncedAt && `Synchronisé le ${formatDate(lastSyncedAt)}`
            ))}
          {status === 'error' && (
            <>
              <span>Erreur</span>
              {errorAt && <span className="text-md-text-muted"> · {formatDate(errorAt)}</span>}
              {errorMessage && (
                <div className="text-md-danger/80 mt-0.5 line-clamp-2 text-[10px] italic">
                  {errorMessage}
                </div>
              )}
            </>
          )}
          {status === 'skipped' && 'Sync désactivée (mode TEST)'}
          {status === 'not-applicable' && (
            <span className="text-md-text-muted">N/A (Cas B — manifestation d&apos;intérêt)</span>
          )}
          {status === 'not-implemented' && (
            <span className="text-md-text-muted">À venir ({notImplementedNote})</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: SyncStatus }) {
  if (status === 'synced')
    return <CheckCircle2 className="text-md-success mt-0.5 size-4 shrink-0" aria-hidden />;
  if (status === 'error')
    return <AlertCircle className="text-md-danger mt-0.5 size-4 shrink-0" aria-hidden />;
  if (status === 'skipped')
    return <MinusCircle className="text-md-warning mt-0.5 size-4 shrink-0" aria-hidden />;
  if (status === 'not-applicable')
    return <MinusCircle className="text-md-text-muted mt-0.5 size-4 shrink-0" aria-hidden />;
  return <Clock className="text-md-text-muted mt-0.5 size-4 shrink-0" aria-hidden />;
}

function computeStatus({
  lastSyncedAt,
  errorMessage,
  isTest,
}: {
  lastSyncedAt: string | null;
  errorMessage: string | null;
  errorAt?: string | null;
  isTest: boolean;
}): SyncStatus {
  if (isTest) return 'skipped';
  if (errorMessage) return 'error';
  if (lastSyncedAt) return 'synced';
  return 'pending';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
