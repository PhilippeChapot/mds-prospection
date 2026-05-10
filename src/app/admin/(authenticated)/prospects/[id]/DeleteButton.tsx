'use client';

import { useTransition, useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { deleteProspectAction } from './actions';
import { safeServerAction } from '@/lib/utils/safe-server-action';

export function DeleteProspectButton({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="size-4" aria-hidden />
          Supprimer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer ce prospect ?</DialogTitle>
          <DialogDescription>
            Cette action est irreversible. Le prospect, ses activites et son historique audit seront
            perdus. Le contact et la societe restent intacts.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Annuler
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                // P5.x.7.pre : safeServerAction re-throw le signal
                // NEXT_REDIRECT pour eviter le faux toast d'erreur
                // (deleteProspectAction redirect vers /admin/prospects).
                safeServerAction(
                  () => deleteProspectAction(prospectId),
                  'Erreur lors de la suppression du prospect',
                ),
              )
            }
          >
            {pending ? 'Suppression…' : 'Confirmer la suppression'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
