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

const STATUSES = [
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'paye_integral',
  'signe',
  'perdu',
] as const;
type Status = (typeof STATUSES)[number];

const LABEL: Record<Status, string> = {
  lead: 'Lead',
  contact: 'En contact',
  devis_envoye: 'Devis envoye',
  acompte_paye: 'Acompte paye',
  paye_integral: 'Paye integral',
  signe: 'Signe',
  perdu: 'Perdu',
};

export function StatusEditor({
  prospectId,
  currentStatus,
}: {
  prospectId: string;
  currentStatus: Status;
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
        {STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === currentStatus}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(async () => {
                try {
                  await updateProspectStatusAction(prospectId, s);
                  toast.success(`Statut: ${LABEL[s]}`);
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
