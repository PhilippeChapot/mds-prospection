'use client';

/**
 * P6.x.SellsyDedupClient — UI manual link companies ↔ Sellsy.
 *
 * 'use client' : useState + onClick + autocomplete async [[feedback_check_use_client_before_event_handlers]].
 *
 * UX :
 *   - Si déjà lié : affiche le sellsy_id + bouton "Modifier" / "Délier"
 *   - Sinon : bouton "Lier manuellement" → ouvre le picker autocomplete
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Link2, Link2Off, Pencil } from 'lucide-react';
import {
  linkCompanyToSellsyClientAction,
  unlinkCompanyFromSellsyClientAction,
} from '@/lib/admin/companies/sellsy-link-actions';
import { SellsyClientSearchPicker } from './SellsyClientSearchPicker';

type Props = {
  companyId: string;
  currentSellsyId: string | null;
  /** Nom MDS de la company (pour pré-remplir la query du picker). */
  companyMdsName: string;
};

export function SellsyClientLinkSection({ companyId, currentSellsyId, companyMdsName }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLink(sellsyId: string, sellsyName: string) {
    setError(null);
    startTransition(async () => {
      const r = await linkCompanyToSellsyClientAction({
        company_id: companyId,
        sellsy_company_id: sellsyId,
        sellsy_company_name: sellsyName,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleUnlink() {
    if (
      !confirm(
        'Délier le client Sellsy ? Au prochain devis, MDS tentera de retrouver / créer automatiquement.',
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await unlinkCompanyFromSellsyClientAction({ company_id: companyId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <SellsyClientSearchPicker
          initialQuery={companyMdsName}
          onPicked={handleLink}
          onCancel={() => setEditing(false)}
          disabled={pending}
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (currentSellsyId) {
    return (
      <div className="space-y-2">
        <p className="text-md-text text-sm">
          Client Sellsy lié · ID Sellsy :{' '}
          <code className="border-md-border bg-muted rounded border px-1.5 py-0.5 text-xs">
            {currentSellsyId}
          </code>
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://go.sellsy.com/companies/${currentSellsyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-md-blue inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            Voir dans Sellsy <ExternalLink className="size-3" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className="border-md-border bg-card text-md-text hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
          >
            <Pencil className="size-3" aria-hidden /> Modifier le lien
          </button>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <Link2Off className="size-3" aria-hidden /> Délier
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-md-text-muted text-sm">
        Aucun client Sellsy lié. Au prochain devis, MDS cherchera automatiquement (SIREN, nom) ou
        créera un nouveau client.
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="bg-md-blue hover:bg-md-blue-dark inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
      >
        <Link2 className="size-3.5" aria-hidden />
        Lier manuellement à un client Sellsy
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
