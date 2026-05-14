'use client';

import { useState, useTransition } from 'react';
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface SyncControlsProps {
  mode: 'push' | 'pull';
  adminOnly: boolean;
  canPull: boolean;
  unsyncedCount: number;
}

const PUSH_LIMITS = [50, 100, 200, 500] as const;

export function SyncControls({ mode, canPull, unsyncedCount }: SyncControlsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [limit, setLimit] = useState<number>(100);

  function handlePush() {
    start(async () => {
      try {
        const res = await fetch(`/api/admin/sync-contacts-to-brevo?limit=${limit}`, {
          method: 'POST',
        });
        const json: {
          ok: boolean;
          attempted?: number;
          created?: number;
          linked?: number;
          failed?: number;
          errors?: Array<{ email: string; message: string }>;
          error?: string;
        } = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? 'Sync échouée');
        }
        const parts = [
          `${json.attempted ?? 0} tentés`,
          `${json.created ?? 0} créés`,
          `${json.linked ?? 0} liés`,
        ];
        if ((json.failed ?? 0) > 0) parts.push(`${json.failed} erreurs`);
        toast.success(`Push OK — ${parts.join(', ')}`);
        if (json.errors && json.errors.length > 0) {
          console.warn('[contacts-sync] push errors', json.errors);
        }
        router.refresh();
      } catch (err) {
        toast.error(`Échec push : ${(err as Error).message}`);
      }
    });
  }

  function handlePull() {
    start(async () => {
      try {
        const res = await fetch('/api/admin/pull-contacts-from-brevo', { method: 'POST' });
        const json: {
          ok: boolean;
          fetched?: number;
          linked?: number;
          created?: number;
          skippedNoCompany?: number;
          skippedNoEmail?: number;
          failed?: number;
          error?: string;
        } = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? 'Pull échoué');
        }
        const parts = [
          `${json.fetched ?? 0} récupérés`,
          `${json.linked ?? 0} liés`,
          `${json.created ?? 0} créés`,
        ];
        if ((json.skippedNoCompany ?? 0) > 0) {
          parts.push(`${json.skippedNoCompany} sans company`);
        }
        if ((json.failed ?? 0) > 0) parts.push(`${json.failed} erreurs`);
        toast.success(`Pull OK — ${parts.join(', ')}`);
        router.refresh();
      } catch (err) {
        toast.error(`Échec pull : ${(err as Error).message}`);
      }
    });
  }

  if (mode === 'push') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-md-text-muted flex items-center gap-2 text-xs">
          Batch
          <select
            value={limit}
            onChange={(e) => setLimit(Number.parseInt(e.target.value, 10))}
            disabled={pending}
            className="border-md-border bg-card rounded-md border px-2 py-1 text-sm"
          >
            {PUSH_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          onClick={handlePush}
          disabled={pending || unsyncedCount === 0}
          className="bg-md-blue hover:bg-md-blue-dark"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="size-3.5" aria-hidden />
          )}
          Push next {limit} contacts to Brevo
        </Button>
        {unsyncedCount === 0 ? (
          <span className="text-md-text-muted text-xs">Aucun contact à pousser.</span>
        ) : null}
      </div>
    );
  }

  // Pull mode
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={handlePull} disabled={pending || !canPull} variant="outline">
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <ArrowLeft className="size-3.5" aria-hidden />
        )}
        Pull contacts from Brevo (one-shot)
      </Button>
      <span className="text-md-text-muted text-xs">
        Couvre jusqu&apos;à 10 000 contacts par run.
      </span>
    </div>
  );
}
