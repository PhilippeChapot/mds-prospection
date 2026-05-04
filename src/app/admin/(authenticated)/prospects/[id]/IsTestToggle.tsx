'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toggleProspectIsTestAction } from './actions';
import { cn } from '@/lib/utils';

/**
 * Toggle is_test du prospect (admin only).
 *
 * Quand activé : tous les helpers de sync P4 (Sellsy / Stripe / Brevo / VIES)
 * bypass via assertSyncAllowed(prospect) qui throw SyncSkippedError.
 * Utile pour les tests d'integration sans polluer Sellsy / Brevo prod.
 */
export function IsTestToggle({ prospectId, isTest }: { prospectId: string; isTest: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    const next = !isTest;
    if (next) {
      if (
        !confirm(
          "Marquer ce prospect comme TEST ?\n\nLes syncs externes (Sellsy, Stripe, Brevo) seront desactivees pour ce prospect tant qu'il reste en mode test.",
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      try {
        await toggleProspectIsTestAction(prospectId, next);
        toast.success(next ? 'Mode test activé.' : 'Mode test désactivé.');
        router.refresh();
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={pending}
      title={
        isTest
          ? 'Prospect TEST — syncs externes desactivees. Cliquer pour repasser en prod.'
          : 'Marquer ce prospect comme TEST (bypass syncs externes).'
      }
      className={cn(
        isTest && 'border-md-warning/40 bg-md-warning/10 text-md-warning hover:bg-md-warning/20',
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <FlaskConical className="size-4" aria-hidden />
      )}
      {isTest ? 'Mode TEST actif' : 'Marquer TEST'}
    </Button>
  );
}
