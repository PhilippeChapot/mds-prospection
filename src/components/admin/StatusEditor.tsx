'use client';

import { useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusPill } from './StatusPill';
import { updateProspectStatusAction } from '@/app/admin/(authenticated)/prospects/[id]/actions';
import { toast } from 'sonner';
import { PIPELINE_ORDER, PROSPECT_STATUS_LABEL_FR } from '@/lib/supabase/constants';
import type { ProspectStatus } from '@/lib/supabase/constants';

export function StatusEditor({
  prospectId,
  currentStatus,
  onPaymentStatus,
}: {
  prospectId: string;
  currentStatus: ProspectStatus;
  /**
   * P5.x.ManualPaymentRecording : si fourni, sélectionner 'acompte_paye' ou
   * 'paye_integral' n'appelle PAS updateProspectStatusAction directement mais
   * délègue (ex: ouvrir la modale d'enregistrement de paiement). Les autres
   * statuts gardent le comportement normal.
   */
  onPaymentStatus?: (status: 'acompte_paye' | 'paye_integral') => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-full transition hover:opacity-80 focus-visible:outline-none"
        disabled={pending}
      >
        <StatusPill status={currentStatus} />
        <ChevronDown className="text-md-text-muted size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PIPELINE_ORDER.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === currentStatus}
            onSelect={(event) => {
              event.preventDefault();
              // P5.x : acompte_paye / paye_integral → délègue à la modale
              // paiement (si handler fourni) au lieu de changer le statut sec.
              if (onPaymentStatus && (s === 'acompte_paye' || s === 'paye_integral')) {
                onPaymentStatus(s);
                return;
              }
              startTransition(async () => {
                try {
                  await updateProspectStatusAction(prospectId, s);
                  toast.success(`Statut: ${PROSPECT_STATUS_LABEL_FR[s]}`);
                } catch (err) {
                  toast.error(`Erreur: ${err instanceof Error ? err.message : 'inconnue'}`);
                }
              });
            }}
          >
            <StatusPill status={s} />
            {s === currentStatus ? (
              <span className="text-md-text-muted ml-auto text-[10px]">actif</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
