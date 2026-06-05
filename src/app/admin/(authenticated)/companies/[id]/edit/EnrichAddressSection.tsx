'use client';

/**
 * P5.x.ConnectOnAirDirectoryCache — section cascade enrichissement adresse.
 *
 * Remplace ApolloEnrichAddressButton (deprecated). 3 boutons :
 *   - "Enrichir automatiquement" (cascade CoA -> Apollo)
 *   - "Forcer ConnectOnAir" (cache local)
 *   - "Forcer Apollo" (API live, payant — desactive si pas de website)
 *
 * Le repliage "Sources specifiques" utilise <details>/<summary> natif
 * (zero dep + accessible par defaut).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  enrichCompanyAddressAction,
  enrichCompanyAddressFromConnectOnAirAction,
  enrichCompanyAddressFromApolloAction,
  type EnrichActionResult,
} from '@/lib/admin/companies/enrich-actions';

interface Props {
  companyId: string;
  hasWebsite: boolean;
}

export function EnrichAddressSection({ companyId, hasWebsite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<EnrichActionResult | null>(null);

  function run(action: () => Promise<EnrichActionResult>) {
    startTransition(async () => {
      setLast(null);
      const r = await action();
      setLast(r);
      if (r.ok) {
        toast.success(`${labelForSource(r.source)} a rempli : ${r.fieldsUpdated.join(', ')}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="default"
        onClick={() => run(() => enrichCompanyAddressAction({ company_id: companyId }))}
        disabled={pending}
        className="w-full justify-center"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {pending ? 'Enrichissement…' : 'Enrichir automatiquement (ConnectOnAir + Apollo)'}
      </Button>

      <details className="group">
        <summary className="text-md-text-muted hover:text-md-text inline-flex cursor-pointer items-center gap-1 text-xs underline-offset-2 hover:underline">
          Sources spécifiques
          <span aria-hidden className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              run(() => enrichCompanyAddressFromConnectOnAirAction({ company_id: companyId }))
            }
            disabled={pending}
          >
            📻 Forcer ConnectOnAir
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !hasWebsite}
            title={hasWebsite ? undefined : "Ajoutez un site web d'abord."}
            onClick={() =>
              run(() => enrichCompanyAddressFromApolloAction({ company_id: companyId }))
            }
          >
            🌐 Forcer Apollo
          </Button>
        </div>
      </details>

      {last ? <ResultAlert result={last} /> : null}
    </div>
  );
}

function ResultAlert({ result }: { result: EnrichActionResult }) {
  if (result.ok) {
    const cascadeUsedApolloFallback =
      result.cascadeUsed && result.cascadeUsed.length > 1 && result.source === 'apollo';
    return (
      <div
        role="status"
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
      >
        <div>
          ✓ Enrichi via <strong>{labelForSource(result.source)}</strong>
          {cascadeUsedApolloFallback ? (
            <span className="ml-1 text-emerald-900/80">
              (fallback après ConnectOnAir sans match)
            </span>
          ) : null}
        </div>
        <div className="mt-0.5">
          Champs mis à jour : <code>{result.fieldsUpdated.join(', ')}</code>
        </div>
        {result.matchName ? (
          <div className="mt-0.5 text-emerald-900/70">Match : « {result.matchName} »</div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      ⚠️ {result.error}
      {result.cascadeUsed && result.cascadeUsed.length > 1 ? (
        <div className="mt-1 text-amber-900/80">
          ConnectOnAir : {result.coaError ?? '—'} · Apollo : {result.apolloError ?? '—'}
        </div>
      ) : null}
    </div>
  );
}

function labelForSource(source: 'connectonair' | 'apollo' | 'manual' | 'none'): string {
  switch (source) {
    case 'connectonair':
      return '📻 ConnectOnAir';
    case 'apollo':
      return '🌐 Apollo';
    case 'manual':
      return 'Manuel';
    default:
      return 'aucune source';
  }
}
