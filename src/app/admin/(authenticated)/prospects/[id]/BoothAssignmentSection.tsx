'use client';

import { useState, useTransition } from 'react';
import { MapPin, Pencil } from 'lucide-react';
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
import { assignBoothAction } from './actions';
import { safeServerAction } from '@/lib/utils/safe-server-action';

export function BoothAssignmentSection({
  prospectId,
  current,
  assignedAt,
  assigneeName,
}: {
  prospectId: string;
  current: string | null;
  assignedAt: string | null;
  assigneeName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [pending, startTransition] = useTransition();

  const dateLabel = assignedAt
    ? new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(assignedAt))
    : null;

  return (
    <div className="bg-card border-md-border space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Emplacement stand
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Pencil className="size-3.5" aria-hidden />
              {current ? 'Modifier' : 'Attribuer'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {current ? 'Modifier le stand attribué' : 'Attribuer un stand'}
              </DialogTitle>
              <DialogDescription>
                Format libre — ex: <code>E5</code>, <code>Allée Audio - Stand 12</code>. Laissez
                vide pour retirer l&apos;attribution.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="booth" className="font-semibold">
                Code emplacement
              </Label>
              <Input
                id="booth"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="ex: E5"
                disabled={pending}
                maxLength={100}
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
                      () => assignBoothAction(prospectId, value || null),
                      "Erreur lors de l'attribution du stand",
                    );
                    if (result !== undefined) setOpen(false);
                  })
                }
              >
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {current ? (
        <div className="flex items-center gap-3">
          <MapPin className="text-md-blue size-5 shrink-0" aria-hidden />
          <div>
            <div className="text-md-text text-lg font-bold">{current}</div>
            {dateLabel ? (
              <div className="text-md-text-muted text-xs">
                Attribué le {dateLabel}
                {assigneeName ? ` par ${assigneeName}` : ''}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-md-text-muted text-sm">Pas encore d&apos;emplacement attribué.</p>
      )}
    </div>
  );
}
