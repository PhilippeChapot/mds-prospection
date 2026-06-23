'use client';

/**
 * P5.x.SmartAddApolloEnrichment — bandeau « ajouter d'autres décisionnaires »
 * affiché après confirmSmartAdd. Ouvre ApolloEnrichDecisionMakersModal.
 */

import { useState } from 'react';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApolloEnrichDecisionMakersModal } from './ApolloEnrichDecisionMakersModal';

export function ApolloDecisionMakersBanner({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-md-blue/30 bg-md-blue/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <p className="text-md-text text-sm">
        💡 Voulez-vous ajouter d&apos;autres décisionnaires de cette société ?
      </p>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Target className="size-4" aria-hidden /> Enrichir via Apollo (décideurs)
      </Button>
      {open && (
        <ApolloEnrichDecisionMakersModal companyId={companyId} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
