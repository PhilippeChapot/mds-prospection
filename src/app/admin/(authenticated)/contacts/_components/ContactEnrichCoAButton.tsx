'use client';

/**
 * P5.x.ConnectOnAirContactsCache (V2) — bouton inline d enrichissement
 * d un contact MDS via le cache ConnectOnAir.
 *
 * Matching email LOWER+TRIM strict cote DB (col email_normalized).
 * Upsert if empty : ne touche QUE les champs vides du contact MDS.
 *
 * Affiche un feedback toast immediat (success / warning / error) +
 * router.refresh pour repercuter les nouvelles valeurs dans la liste.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { enrichContactFromConnectOnAirAction } from '@/lib/admin/contacts/enrich-actions';

interface Props {
  contactId: string;
  hasEmail: boolean;
}

export function ContactEnrichCoAButton({ contactId, hasEmail }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!hasEmail) {
    return (
      <span
        className="text-md-text-muted inline-flex items-center text-[10px]"
        title="Ce contact n a pas d email — matching CoA impossible."
      >
        —
      </span>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const r = await enrichContactFromConnectOnAirAction({ contact_id: contactId });
      if (!r.ok) {
        toast.warning(r.error);
        return;
      }
      toast.success(
        `📻 CoA a enrichi : ${r.fieldsUpdated.join(', ')}` +
          (r.matchEmail ? ` (match ${r.matchEmail})` : ''),
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Enrichir ce contact via le cache ConnectOnAir (matching email)."
      className="border-md-border text-md-text hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Radio className="size-3" aria-hidden />
      )}
      <span>{pending ? '…' : 'CoA'}</span>
    </button>
  );
}
