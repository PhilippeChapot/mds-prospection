'use client';

/**
 * P7.x.AffiliateManualCompanyAttach — section "Sociétés attachées manuellement"
 * sur la fiche affilié. Liste les claims source='manual_admin' (société, auteur,
 * date) + bouton détacher (super_admin). L'attachement passe par
 * <AttachCompanyDialog>.
 *
 * Visible par tous les admins (lecture), actions réservées super_admin.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { detachCompanyFromAffiliateAction } from '@/lib/affiliate-claims/manual-attach-actions';
import type { ManualAttachRow, ClaimSource } from '@/lib/affiliate-claims/queries';
import { AttachCompanyDialog } from './AttachCompanyDialog';

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );

const SOURCE_LABEL: Record<ClaimSource, string> = {
  cookie_tracking: '🍪 Tracking',
  declared_by_affiliate: '👤 Affilié',
  declared_by_company: '🏢 Société',
  manual_admin: '🔧 Admin',
};

export function AffiliateManualAttachSection({
  affiliateId,
  affiliateName,
  attachments,
  isSuperAdmin,
}: {
  affiliateId: string;
  affiliateName: string;
  attachments: ManualAttachRow[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ManualAttachRow | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, startTx] = useTransition();

  function confirmDetach() {
    if (!target) return;
    if (reason.trim().length < 3) {
      toast.error('Indiquez un motif (3 caractères min).');
      return;
    }
    startTx(async () => {
      const r = await detachCompanyFromAffiliateAction({ claim_id: target.claimId, reason });
      if (r.ok) {
        toast.success(`${target.companyName} détachée.`);
        setTarget(null);
        setReason('');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Card className="border-md-border space-y-3 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Sociétés liées ({attachments.length})
        </h2>
        {isSuperAdmin ? (
          <AttachCompanyDialog affiliateId={affiliateId} affiliateName={affiliateName} />
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <p className="text-md-text-muted text-sm">
          Aucune société liée.
          {!isSuperAdmin ? ' (Attachement réservé aux super_admin.)' : ''}
        </p>
      ) : (
        <ul className="divide-md-border divide-y">
          {attachments.map((a) => (
            <li key={a.claimId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-md-text font-semibold">{a.companyName}</div>
                <div className="text-md-text-muted text-xs">
                  {SOURCE_LABEL[a.source] ?? a.source} · {fmtDate(a.attachedAt)}
                  {a.attachedByName ? ` · par ${a.attachedByName}` : ''}
                </div>
              </div>
              {isSuperAdmin && a.source === 'manual_admin' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReason('');
                    setTarget(a);
                  }}
                  className="text-md-magenta hover:text-md-magenta/80"
                >
                  <Link2Off className="size-3.5" aria-hidden />
                  Détacher
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Détacher {target?.companyName}</DialogTitle>
            <DialogDescription>
              Retire l&apos;attribution manuelle de cette société à {affiliateName}. Les prospects
              déjà rattachés conservent leur affilié (impact commission préservé).
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="text-md-text-muted text-xs font-semibold">Motif (obligatoire)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex : attribution erronée, doublon…"
              className="border-md-border focus-visible:border-md-magenta/40 w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={confirmDetach}
              disabled={submitting}
              className="bg-md-magenta hover:bg-md-magenta/90"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                'Confirmer le détachement'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
