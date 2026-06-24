'use client';

/**
 * P12.x.EmailIntegration — contrôles par compte : Tester connexion (IMAP+SMTP
 * live) + Resynchroniser maintenant.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlugZap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resyncEmailAccountAction, testEmailAccountAction } from '@/lib/admin/emails/actions';

export function EmailAccountControls({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [resyncing, startResync] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  async function test() {
    setTesting(true);
    setStatus(null);
    const r = await testEmailAccountAction(accountId);
    setTesting(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const { imap, smtp } = r.result;
    setStatus(
      `IMAP : ${imap.ok ? '✅' : `❌ ${imap.error ?? ''}`} · SMTP : ${smtp.ok ? '✅' : `❌ ${smtp.error ?? ''}`}`,
    );
    if (imap.ok && smtp.ok) toast.success('Connexion IMAP + SMTP OK.');
    else toast.error('Connexion partielle/échouée.');
  }

  function resync() {
    startResync(async () => {
      const r = await resyncEmailAccountAction(accountId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Sync : ${r.inserted} nouveau(x) · ${r.skipped} ignoré(s) · ${r.fetched} récupéré(s).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={testing} onClick={test}>
          {testing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <PlugZap className="size-4" aria-hidden />
          )}
          Tester connexion
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={resyncing} onClick={resync}>
          {resyncing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Resynchroniser
        </Button>
      </div>
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </div>
  );
}
