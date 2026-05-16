'use client';

import { useTransition } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { bulkInitOtherAction } from '@/lib/tarifs/admin-actions';

export function BulkInitButton({ untagged }: { untagged: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    if (untagged === 0) {
      toast.info('Tous les produits sont déjà tagués.');
      return;
    }
    if (!confirm(`Initialiser ${untagged} produit(s) avec catégorie "autre" ?`)) return;
    start(async () => {
      const result = await bulkInitOtherAction();
      if (result.ok) {
        toast.success(`${result.data?.inserted ?? 0} produit(s) initialisé(s) comme "autre"`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={run} disabled={pending}>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-3.5" aria-hidden />
      )}
      Initialiser tout comme « autre » ({untagged})
    </Button>
  );
}
