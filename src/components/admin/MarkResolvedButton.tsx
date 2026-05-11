'use client';

import { useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveAlertAction } from '@/app/admin/(authenticated)/actions-alerts';
import { safeServerAction } from '@/lib/utils/safe-server-action';

export function MarkResolvedButton({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Marquer cette alerte comme résolue"
      onClick={() =>
        startTransition(() =>
          safeServerAction(() => resolveAlertAction(alertId), 'Erreur lors de la résolution'),
        )
      }
    >
      <Check className="size-3.5" aria-hidden />
      {pending ? '…' : 'Résoudre'}
    </Button>
  );
}
