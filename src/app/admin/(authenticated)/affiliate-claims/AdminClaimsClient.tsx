'use client';

/**
 * P7.x.1.F — UI admin claims avec 3 tabs.
 *
 * Pending : actions Valider / Rejeter
 * Active : affichage + bouton "Supprimer" si role=super_admin (gated UI
 *          + serveur via requireSuperAdmin)
 * Rejected : affichage avec raison
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Check, X, Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  validateAffiliateClaimAction,
  rejectAffiliateClaimAction,
  deleteAffiliateClaimAction,
} from '@/lib/affiliate-claims/actions';
import type { AdminClaimRow } from '@/lib/affiliate-claims/queries';

interface Props {
  pending: AdminClaimRow[];
  active: AdminClaimRow[];
  rejected: AdminClaimRow[];
  currentRole: 'admin' | 'sales' | 'super_admin';
}

export function AdminClaimsClient({ pending, active, rejected, currentRole }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'pending' | 'active' | 'rejected'>('pending');
  const [rejectClaim, setRejectClaim] = useState<AdminClaimRow | null>(null);
  const [deleteClaim, setDeleteClaim] = useState<AdminClaimRow | null>(null);
  const [busy, startTx] = useTransition();
  const fmtDate = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  function handleValidate(claim: AdminClaimRow) {
    startTx(async () => {
      const r = await validateAffiliateClaimAction({
        claim_id: claim.id,
        company_id: claim.companyId ?? undefined,
        create_new_company: !claim.companyId,
      });
      if (r.ok) {
        toast.success('Claim validé.');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">⏳ Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="active">✅ Active ({active.length})</TabsTrigger>
          <TabsTrigger value="rejected">❌ Rejected ({rejected.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <ClaimsTable
            rows={pending}
            fmtDate={fmtDate}
            actions={(row) => (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={busy}
                  onClick={() => handleValidate(row)}
                >
                  <Check className="mr-1 size-3" aria-hidden /> Valider
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRejectClaim(row)}
                >
                  <X className="mr-1 size-3" aria-hidden /> Rejeter
                </Button>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="active">
          <ClaimsTable
            rows={active}
            fmtDate={fmtDate}
            actions={(row) =>
              currentRole === 'super_admin' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  disabled={busy}
                  onClick={() => setDeleteClaim(row)}
                >
                  <Trash2 className="mr-1 size-3" aria-hidden /> Supprimer
                </Button>
              ) : (
                <span className="text-md-text-muted text-[10px]">super_admin only</span>
              )
            }
          />
        </TabsContent>

        <TabsContent value="rejected">
          <ClaimsTable rows={rejected} fmtDate={fmtDate} actions={() => null} />
        </TabsContent>
      </Tabs>

      {/* Modal reject (saisie raison) */}
      <Dialog open={rejectClaim !== null} onOpenChange={(o) => !o && setRejectClaim(null)}>
        <RejectDialogContent
          claim={rejectClaim}
          busy={busy}
          onSubmit={(reason) => {
            if (!rejectClaim) return;
            startTx(async () => {
              const r = await rejectAffiliateClaimAction({
                claim_id: rejectClaim.id,
                rejected_reason: reason,
              });
              if (r.ok) {
                toast.success('Claim rejeté.');
                setRejectClaim(null);
                router.refresh();
              } else {
                toast.error(r.error);
              }
            });
          }}
        />
      </Dialog>

      {/* Modal delete (super_admin uniquement, raison obligatoire pour audit) */}
      <Dialog open={deleteClaim !== null} onOpenChange={(o) => !o && setDeleteClaim(null)}>
        <DeleteDialogContent
          claim={deleteClaim}
          busy={busy}
          onSubmit={(reason) => {
            if (!deleteClaim) return;
            startTx(async () => {
              const r = await deleteAffiliateClaimAction({
                claim_id: deleteClaim.id,
                reason,
              });
              if (r.ok) {
                toast.success('Claim supprimé (audit log enregistré).');
                setDeleteClaim(null);
                router.refresh();
              } else {
                toast.error(r.error);
              }
            });
          }}
        />
      </Dialog>
    </>
  );
}

function ClaimsTable({
  rows,
  fmtDate,
  actions,
}: {
  rows: AdminClaimRow[];
  fmtDate: Intl.DateTimeFormat;
  actions: (row: AdminClaimRow) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-6 text-center text-sm shadow-sm">
        Aucun claim dans cet état.
      </div>
    );
  }
  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Affilié</th>
              <th className="px-4 py-3">Société</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Déclarée le</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-md-border hover:bg-muted/20 border-t">
                <td className="px-4 py-3">
                  <div className="text-md-text font-semibold">{row.affiliateDisplayName}</div>
                  <code className="text-md-text-muted font-mono text-[10px]">
                    {row.affiliateToken}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <div className="text-md-text">
                    {row.resolvedCompanyName ?? row.declaredCompanyName ?? '—'}
                  </div>
                  {row.declaredCompanyWebsite ? (
                    <div className="text-md-text-muted font-mono text-[10px]">
                      {row.declaredCompanyWebsite}
                    </div>
                  ) : null}
                  {row.notesAffiliate ? (
                    <div className="text-md-text-muted mt-1 max-w-md text-[10px] italic">
                      « {row.notesAffiliate} »
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.source === 'cookie_tracking'
                    ? '🍪 Cookie'
                    : row.source === 'declared_by_company'
                      ? '📝 Société'
                      : '👤 Affilié'}
                </td>
                <td className="text-md-text-muted px-4 py-3 text-xs">
                  {fmtDate.format(new Date(row.declaredAt))}
                </td>
                <td className="px-4 py-3">{actions(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RejectDialogContent({
  claim,
  busy,
  onSubmit,
}: {
  claim: AdminClaimRow | null;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  if (!claim) return null;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Rejeter le claim</DialogTitle>
        <DialogDescription>
          Indiquez la raison du rejet (visible dans l&apos;audit log, optionnellement envoyée à
          l&apos;affilié).
        </DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="reject-reason">Raison du rejet</Label>
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex : société déjà attribuée à un autre affilié"
          disabled={busy}
        />
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setReason('');
          }}
        >
          Annuler
        </Button>
        <Button
          disabled={busy || reason.trim().length < 3}
          onClick={() => onSubmit(reason.trim())}
          className="bg-red-600 hover:bg-red-700"
        >
          Rejeter
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeleteDialogContent({
  claim,
  busy,
  onSubmit,
}: {
  claim: AdminClaimRow | null;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  if (!claim) return null;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>⚠️ Supprimer ce claim actif</DialogTitle>
        <DialogDescription>
          Action super_admin uniquement. La suppression retire l&apos;attribution{' '}
          <strong>{claim.affiliateDisplayName}</strong> ↔{' '}
          <strong>{claim.resolvedCompanyName ?? claim.declaredCompanyName}</strong> et peut impacter
          la commission de l&apos;affilié. Audit log enregistré.
        </DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="delete-reason">Raison (obligatoire pour audit)</Label>
        <Input
          id="delete-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex : fraude détectée"
          disabled={busy}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => setReason('')}>
          Annuler
        </Button>
        <Button
          disabled={busy || reason.trim().length < 3}
          onClick={() => onSubmit(reason.trim())}
          className="bg-red-600 hover:bg-red-700"
        >
          <Trash2 className="mr-1 size-3" aria-hidden /> Supprimer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
