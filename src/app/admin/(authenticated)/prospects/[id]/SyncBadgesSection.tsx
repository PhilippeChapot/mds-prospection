'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, AlertCircle, Clock, MinusCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resyncProspectAction } from './actions';
import { cn } from '@/lib/utils';

type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped' | 'not-implemented';

interface Props {
  prospectId: string;
  isTest: boolean;
  sellsy: {
    lastSyncedAt: string | null;
    errorMessage: string | null;
    errorAt: string | null;
  };
  stripe: {
    lastSyncedAt: string | null;
  };
  brevo: {
    lastSyncedAt: string | null;
  };
}

export function SyncBadgesSection({ prospectId, isTest, sellsy, stripe, brevo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleResync() {
    startTransition(async () => {
      try {
        await resyncProspectAction(prospectId);
        toast.success('Resynchronisation lancée. Refresh dans quelques secondes…');
        // Refresh apres un court delai pour laisser le temps a la sync de completer.
        setTimeout(() => router.refresh(), 3000);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  const sellsyStatus = computeStatus({ ...sellsy, isTest });
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

      <div className="grid gap-2 sm:grid-cols-3">
        <SyncBadge
          provider="Sellsy"
          status={sellsyStatus}
          lastSyncedAt={sellsy.lastSyncedAt}
          errorMessage={sellsy.errorMessage}
          errorAt={sellsy.errorAt}
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
}: {
  provider: string;
  status: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage?: string | null;
  errorAt?: string | null;
  notImplementedNote?: string;
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
          {status === 'synced' && lastSyncedAt && `Synchronisé le ${formatDate(lastSyncedAt)}`}
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
