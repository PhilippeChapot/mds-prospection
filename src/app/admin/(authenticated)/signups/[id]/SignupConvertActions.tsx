'use client';

/**
 * P5.x.SignupForceConversion — bouton convertir + dialog force conversion.
 *
 * Gère 3 cas :
 *  1. Déjà converti → chip "Déjà converti en prospect".
 *  2. step2_completed → bouton "Convertir en prospect" (flux normal).
 *  3. Autre status (étape 2 incomplète) → bouton force + dialog raison obligatoire.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { convertSignupToProspect } from './actions';
import type { SignupStatus } from '../types';

interface Props {
  signupId: string;
  status: SignupStatus;
  hasProspect: boolean;
  globalPending?: boolean;
}

export function SignupConvertActions({ signupId, status, hasProspect, globalPending }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState('');

  const isDisabled = pending || !!globalPending;
  const canConvert = status === 'step2_completed';
  const canForce = !hasProspect && !canConvert && status !== 'converted' && status !== 'rejected';

  function handleConvert() {
    if (
      !confirm(
        "Convertir cette inscription en prospect ?\n\nCette action :\n- Crée une company + contact si nécessaire\n- Insère un nouveau prospect (status=lead)\n- Vous attribue comme owner\n- Marque l'inscription comme converted",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await convertSignupToProspect(signupId);
      if (result.success && result.data) {
        toast.success('Prospect créé.');
        router.push(`/admin/prospects/${result.data.prospectId}`);
      } else {
        toast.error(`Échec : ${'error' in result ? result.error : 'unknown'}`);
      }
    });
  }

  function handleForceConfirm() {
    startTransition(async () => {
      const result = await convertSignupToProspect(signupId, {
        force: true,
        force_reason: forceReason.trim(),
      });
      if (result.success && result.data) {
        toast.success('Prospect créé (conversion forcée).');
        setForceOpen(false);
        router.push(`/admin/prospects/${result.data.prospectId}`);
      } else {
        toast.error(`Échec : ${'error' in result ? result.error : 'unknown'}`);
      }
    });
  }

  function handleCloseDialog(open: boolean) {
    if (!open) {
      setForceOpen(false);
      setForceReason('');
    }
  }

  if (hasProspect) {
    return (
      <span className="text-md-success bg-md-success/10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
        <CheckCircle2 className="size-3.5" aria-hidden /> Déjà converti en prospect
      </span>
    );
  }

  return (
    <>
      {canConvert && (
        <Button
          type="button"
          onClick={handleConvert}
          disabled={isDisabled}
          className="bg-md-success hover:bg-md-success/90"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
          Convertir en prospect
        </Button>
      )}

      {canForce && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setForceOpen(true)}
          disabled={isDisabled}
          className="border-amber-400 text-amber-700 hover:bg-amber-50"
        >
          <AlertTriangle className="size-4" aria-hidden />
          Convertir (étape 2 incomplète)
        </Button>
      )}

      {!canConvert && !canForce && (
        <Button type="button" disabled className="opacity-60">
          <CheckCircle2 className="size-4" aria-hidden />
          Convertir (étape 2 non finalisée)
        </Button>
      )}

      <Dialog open={forceOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" aria-hidden />
              Conversion forcée
            </DialogTitle>
            <DialogDescription>
              Cette inscription n&apos;a pas finalisé l&apos;étape 2 (statut actuel :{' '}
              <code className="bg-md-bg-soft rounded px-1 py-0.5 text-xs">{status}</code>). La
              conversion sera quand même effectuée mais le step2_payload peut être incomplet.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
            placeholder="Raison obligatoire (ex : Phil rappellera pour finaliser les détails)"
            rows={3}
            maxLength={500}
            autoFocus
          />
          <p className="text-md-text-muted text-right text-[11px]">
            {forceReason.trim().length}/500 · min 3 caractères
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCloseDialog(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleForceConfirm}
              disabled={pending || forceReason.trim().length < 3}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Confirmer la conversion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
