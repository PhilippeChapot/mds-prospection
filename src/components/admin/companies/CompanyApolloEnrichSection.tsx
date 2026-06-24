'use client';

/**
 * P5.x.CompanyNewApolloEnrich — section "Enrichir avec Apollo" en tête du
 * formulaire de création société. Enrichit par domaine/URL (plan Apollo :
 * pas de recherche par nom seul / multi-match) et remonte le mapping au parent.
 */

import { useState, useTransition } from 'react';
import { Rocket, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { enrichCompanyFromApolloAction } from '@/app/admin/(authenticated)/companies/new/actions';
import type { CompanyPrefill } from '@/app/admin/(authenticated)/companies/new/apollo-prefill';

export function CompanyApolloEnrichSection({
  onEnrich,
}: {
  onEnrich: (match: CompanyPrefill) => void;
}) {
  const [query, setQuery] = useState('');
  const [pending, start] = useTransition();

  function run() {
    const q = query.trim();
    if (!q) return;
    start(async () => {
      const r = await enrichCompanyFromApolloAction(q);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      if (!r.match) {
        toast('Aucun résultat Apollo pour cette URL. Complétez manuellement.');
        return;
      }
      onEnrich(r.match);
    });
  }

  return (
    <section className="border-md-border bg-md-blue-light/40 space-y-2 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark flex items-center gap-1.5 text-sm font-bold tracking-wide uppercase">
        <Rocket className="size-4" aria-hidden /> Enrichir avec Apollo (optionnel)
      </h2>
      <p className="text-md-text-muted text-xs">
        Renseigne un domaine web ou une URL. Apollo pré-remplira les champs.
      </p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
          placeholder="podcastmagazine.fr"
          className="flex-1"
        />
        <Button type="button" onClick={run} disabled={pending || query.trim().length === 0}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche…
            </>
          ) : (
            <>
              <Search className="size-4" aria-hidden /> Enrichir
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
