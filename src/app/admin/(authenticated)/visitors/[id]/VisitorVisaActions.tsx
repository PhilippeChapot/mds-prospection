'use client';

/**
 * P15.4 — actions admin workflow visa (approuver / refuser). super_admin only.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import {
  adminApproveInvitationAction,
  adminRejectInvitationAction,
} from '@/lib/admin/visitors/invitation-actions';

export function VisitorVisaActions({
  visitorId,
  status,
  currentRole,
}: {
  visitorId: string;
  status: string | null;
  currentRole: 'admin' | 'sales' | 'super_admin';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  if (!isSuperAdmin(currentRole) || status !== 'pending') return null;

  function approve() {
    startTransition(async () => {
      try {
        await adminApproveInvitationAction({ visitor_id: visitorId });
        toast.success('Invitation approuvée — PDF généré et envoyé.');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function reject() {
    if (!reason.trim()) {
      toast.error('Motif requis.');
      return;
    }
    startTransition(async () => {
      try {
        await adminRejectInvitationAction({ visitor_id: visitorId, reason: reason.trim() });
        toast.success('Demande refusée — email envoyé au visiteur.');
        setRejecting(false);
        setReason('');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div className="border-md-border space-y-3 rounded-md border border-dashed p-3">
      <p className="text-md-text text-sm font-semibold">
        Validation manuelle requise (super_admin)
      </p>
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={approve} disabled={pending}>
            <Check className="size-4" aria-hidden />
            Approuver et générer le PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
            onClick={() => setRejecting(true)}
            disabled={pending}
          >
            <X className="size-4" aria-hidden />
            Refuser
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Motif du refus (communiqué au visiteur)…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
              onClick={reject}
              disabled={pending || !reason.trim()}
            >
              Confirmer le refus
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
