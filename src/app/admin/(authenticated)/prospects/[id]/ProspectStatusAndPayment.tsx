'use client';

/**
 * P5.x.ManualPaymentRecording — wrapper client : dropdown statut (StatusEditor)
 * + bouton « 💰 Enregistrer un paiement » + modale RecordPaymentModal.
 *
 * Sélectionner « Acompte payé » / « Payé intégral » dans le dropdown ouvre la
 * modale pré-remplie (au lieu de changer le statut sans enregistrer le
 * paiement Sellsy). Le bouton libre permet un enregistrement à tout moment.
 */

import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusEditor } from '@/components/admin/StatusEditor';
import type { ProspectStatus } from '@/lib/supabase/constants';
import { RecordPaymentModal } from './RecordPaymentModal';

type PaymentType = 'acompte' | 'solde' | 'ajustement';

export function ProspectStatusAndPayment({
  prospectId,
  currentStatus,
}: {
  prospectId: string;
  currentStatus: ProspectStatus;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PaymentType>('acompte');

  function openWith(t: PaymentType) {
    setType(t);
    setOpen(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusEditor
        prospectId={prospectId}
        currentStatus={currentStatus}
        onPaymentStatus={(s) => openWith(s === 'paye_integral' ? 'solde' : 'acompte')}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => openWith('ajustement')}>
        <Wallet className="size-3.5" aria-hidden /> Enregistrer un paiement
      </Button>
      {open && (
        <RecordPaymentModal
          prospectId={prospectId}
          open={open}
          defaultType={type}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
