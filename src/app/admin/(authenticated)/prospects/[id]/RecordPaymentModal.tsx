'use client';

/**
 * P5.x.ManualPaymentRecording — modale d'enregistrement d'un paiement reçu
 * (virement PRS, chèque, espèces…). Pousse le paiement dans Sellsy et met à
 * jour le prospect via recordManualPaymentAction.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { recordManualPaymentAction } from '@/lib/admin/prospects/record-payment-action';

type PaymentType = 'acompte' | 'solde' | 'ajustement';
type Method = 'virement' | 'cheque' | 'stripe_manuel' | 'especes' | 'autre';

const METHOD_OPTIONS: { value: Method; label: string }[] = [
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'stripe_manuel', label: 'Carte / Stripe (manuel)' },
  { value: 'especes', label: 'Espèces' },
  { value: 'autre', label: 'Autre' },
];

const TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'acompte', label: 'Acompte' },
  { value: 'solde', label: 'Solde' },
  { value: 'ajustement', label: 'Ajustement' },
];

export function RecordPaymentModal({
  prospectId,
  open,
  defaultType,
  onClose,
}: {
  prospectId: string;
  open: boolean;
  defaultType: PaymentType;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<PaymentType>(defaultType);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>('virement');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoUpdateStatus, setAlsoUpdateStatus] = useState(true);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const amountNum = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await recordManualPaymentAction({
          prospect_id: prospectId,
          payment_type: type,
          amount_ttc: amountNum,
          paid_at: paidAt,
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          also_update_status: type === 'ajustement' ? false : alsoUpdateStatus,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `Paiement enregistré${res.status_updated ? ' + statut mis à jour' : ''}. Sync Sellsy OK.`,
        );
        onClose();
        setTimeout(() => router.refresh(), 800);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💰 Enregistrer un paiement reçu</DialogTitle>
          <DialogDescription>
            Le paiement est créé dans Sellsy et alloué au document (facture &gt; pro-forma &gt;
            devis). EUR uniquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={type === t.value ? 'default' : 'outline'}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Montant TTC (€)</Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                placeholder="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Méthode</Label>
            <select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Référence (facultatif)</Label>
            <Input
              id="pay-ref"
              maxLength={100}
              placeholder="Ex : VIR-2026-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes (facultatif)</Label>
            <Textarea
              id="pay-notes"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {type !== 'ajustement' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoUpdateStatus}
                onChange={(e) => setAlsoUpdateStatus(e.target.checked)}
              />
              Passer le statut à « {type === 'solde' ? 'Payé intégral' : 'Acompte payé'} »
            </label>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Enregistrer le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
