'use client';

import { useTransition } from 'react';
import { Check, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateVisitorMessageStatusAction } from '@/lib/visitor-messages/actions';
import type { VisitorMessageStatus } from '@/lib/visitor-messages/types';

/**
 * P9.1-natif — boutons "Marquer lu" / "Archiver" en haut de la fiche
 * visitor_message. Pas de RBAC fine ici : tous les admin/sales/super_admin
 * peuvent changer le statut (RLS verifie cote DB).
 */
export function StatusActions({
  messageId,
  status,
}: {
  messageId: string;
  status: VisitorMessageStatus;
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(next: VisitorMessageStatus) {
    startTransition(async () => {
      const r = await updateVisitorMessageStatusAction({ message_id: messageId, status: next });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Statut mis à jour : ${next}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-md-text-muted self-center text-xs font-medium tracking-wider uppercase">
        Statut actuel : <strong className="text-md-text">{status}</strong>
      </span>
      {status !== 'read' ? (
        <Button variant="outline" size="sm" onClick={() => setStatus('read')} disabled={pending}>
          <Check className="size-4" aria-hidden />
          Marquer lu
        </Button>
      ) : null}
      {status !== 'archived' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatus('archived')}
          disabled={pending}
        >
          <Archive className="size-4" aria-hidden />
          Archiver
        </Button>
      ) : null}
    </div>
  );
}
