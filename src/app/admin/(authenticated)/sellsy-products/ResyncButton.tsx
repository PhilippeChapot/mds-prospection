'use client';

import { useTransition } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ResyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleClick() {
    start(async () => {
      try {
        const res = await fetch('/api/admin/sync-sellsy-products', { method: 'POST' });
        const json: {
          ok: boolean;
          synced?: number;
          autoMapped?: number;
          archived?: number;
          errors?: string[];
          error?: string;
        } = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? 'Sync échouée');
        }
        const errCount = json.errors?.length ?? 0;
        toast.success(
          `Sync OK — ${json.synced ?? 0} items synchronisés${
            json.autoMapped ? `, ${json.autoMapped} auto-mappés` : ''
          }${json.archived ? `, ${json.archived} archivés` : ''}${
            errCount ? ` (${errCount} erreur${errCount > 1 ? 's' : ''})` : ''
          }`,
        );
        router.refresh();
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="bg-md-magenta hover:bg-md-magenta-soft"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden />
      )}
      Re-sync maintenant
    </Button>
  );
}
