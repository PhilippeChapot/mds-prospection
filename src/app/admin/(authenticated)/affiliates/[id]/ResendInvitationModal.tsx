'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resendAffiliateInvitationAction } from '../actions';

export function ResendInvitationModal({
  affiliateId,
  affiliateName,
  contactEmail,
}: {
  affiliateId: string;
  affiliateName: string;
  contactEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTx] = useTransition();

  function handleSend() {
    startTx(async () => {
      const r = await resendAffiliateInvitationAction(affiliateId);
      if (r.ok) {
        toast.success('Invitation envoyée.');
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Mail className="size-4" aria-hidden />
        Renvoyer l&apos;invitation
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renvoyer l&apos;invitation à {affiliateName}</DialogTitle>
            <DialogDescription>
              {contactEmail ? (
                <>
                  Un email d&apos;invitation (code affilié + lien de tracking) sera envoyé à{' '}
                  <strong>{contactEmail}</strong>.
                </>
              ) : (
                <>
                  Pas d&apos;email enregistré pour cet affilié. Éditez la fiche pour en ajouter un
                  avant de renvoyer l&apos;invitation.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="button" onClick={handleSend} disabled={!contactEmail || pending}>
              {pending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
