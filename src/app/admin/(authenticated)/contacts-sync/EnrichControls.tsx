'use client';

import { useState, useTransition } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface EnrichResultPayload {
  ok: boolean;
  orphansWithDomain?: number;
  orphansSkippedFreeProvider?: number;
  brevoTotalScanned?: number;
  domainsMatched?: number;
  contactsCreated?: number;
  domainsNoMatch?: number;
  errors?: number;
  durationSeconds?: number;
  error?: string;
}

export function EnrichControls({ orphansCount }: { orphansCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<EnrichResultPayload | null>(null);

  function handleEnrich() {
    setResult(null);
    start(async () => {
      try {
        const res = await fetch('/api/admin/enrich-contacts-from-brevo', { method: 'POST' });
        const json: EnrichResultPayload = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? 'Enrichissement échoué');
        }
        setResult(json);
        toast.success(
          `Enrichissement OK — ${json.contactsCreated ?? 0} contact(s) créé(s), ${json.domainsMatched ?? 0} domaine(s) matché(s)`,
        );
        router.refresh();
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleEnrich}
        disabled={pending || orphansCount === 0}
        className="bg-md-blue hover:bg-md-blue-dark"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Search className="size-3.5" aria-hidden />
        )}
        {pending
          ? 'Enrichissement en cours…'
          : `Enrichir depuis Brevo (${orphansCount.toLocaleString('fr-FR')} orphelines)`}
      </Button>

      {orphansCount === 0 ? (
        <p className="text-md-text-muted text-xs">
          Aucune société orpheline avec domaine. Rien à enrichir.
        </p>
      ) : null}

      {result?.ok ? (
        <div className="border-md-border rounded-md border bg-emerald-50/60 p-3 text-xs">
          <p className="text-md-text mb-1 font-semibold">Résultats</p>
          <ul className="text-md-text space-y-0.5">
            <li>
              <strong>{result.contactsCreated ?? 0}</strong> contact(s) créé(s) ·{' '}
              <strong>{result.domainsMatched ?? 0}</strong> domaine(s) matché(s) sur{' '}
              <strong>{result.orphansWithDomain ?? 0}</strong> orphelines
            </li>
            <li>
              {result.brevoTotalScanned ?? 0} contact(s) Brevo scannés ·{' '}
              {result.domainsNoMatch ?? 0} sans match
            </li>
            {result.errors && result.errors > 0 ? (
              <li className="text-red-600">{result.errors} erreur(s) — vérifier logs</li>
            ) : null}
            <li className="text-md-text-muted">Durée : {result.durationSeconds ?? 0}s</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
