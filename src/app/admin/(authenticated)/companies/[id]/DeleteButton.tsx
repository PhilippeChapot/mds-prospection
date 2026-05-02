'use client';

import { useState, useTransition } from 'react';
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
import { deleteCompanyAction } from './actions';
import { toast } from 'sonner';

export function DeleteCompanyButton({
  companyId,
  prospectCount,
}: {
  companyId: string;
  prospectCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const blocked = prospectCount > 0;

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
          <DialogTitle>Supprimer cette societe ?</DialogTitle>
          <DialogDescription>
            {blocked ? (
              <>
                <strong className="text-md-danger">{prospectCount} prospect(s) lie(s)</strong> a
                cette societe. Supprime-les ou reaffecte-les a une autre societe avant de pouvoir
                supprimer celle-ci.
              </>
            ) : (
              <>
                Cette action est irreversible. Les contacts rattaches a cette societe seront
                egalement supprimes (ON DELETE CASCADE). L&apos;historique audit est conserve.
              </>
            )}
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
            disabled={pending || blocked}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteCompanyAction(companyId);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Erreur');
                }
              })
            }
          >
            {pending ? 'Suppression…' : 'Confirmer la suppression'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
