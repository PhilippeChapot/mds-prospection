'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markCommissionPaidAction } from '../actions';
import { safeServerAction } from '@/lib/utils/safe-server-action';

export function MarkPaidButton({ prospectId }: { prospectId: string }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-md-success border-md-success/40">
          <Check className="size-3.5" aria-hidden />
          Marquer payée
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer la commission comme payée</DialogTitle>
          <DialogDescription>
            Renseigner la référence du paiement (numéro de virement, etc.) — facultatif mais utile
            pour l&apos;audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reference" className="font-semibold">
            Référence de paiement
          </Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="ex: VIR-2026-05-15-001"
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Annuler
            </Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await safeServerAction(
                  () => markCommissionPaidAction(prospectId, reference || null),
                  'Erreur lors de la mise à jour de la commission',
                );
                if (result !== undefined) {
                  setOpen(false);
                  setReference('');
                }
              })
            }
          >
            {pending ? 'Mise à jour…' : 'Confirmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
