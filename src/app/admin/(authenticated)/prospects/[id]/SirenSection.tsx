'use client';

import { useState, useTransition } from 'react';
import { Loader2, Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resolveSirenAmbiguousAction } from './siren-actions';

interface SirenCandidate {
  siren: string;
  siret: string;
  denomination: string | null;
  ville: string | null;
  address: string | null;
  siege: boolean;
}

interface Props {
  prospectId: string;
  companyId: string;
  siren: string | null;
  sirenVerifiedAt: string | null;
  sirenSource: string | null;
  ambiguousAlert: {
    id: string;
    candidates: SirenCandidate[];
  } | null;
}

export function SirenSection({
  prospectId,
  companyId,
  siren,
  sirenVerifiedAt,
  sirenSource,
  ambiguousAlert,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedSiret, setSelectedSiret] = useState<string>('');

  function handleResolve() {
    if (!selectedSiret) {
      toast.error('Choisis un candidat SIREN');
      return;
    }
    if (!ambiguousAlert) return;
    const picked = ambiguousAlert.candidates.find((c) => c.siret === selectedSiret);
    if (!picked) return;
    start(async () => {
      const result = await resolveSirenAmbiguousAction({
        company_id: companyId,
        prospect_id: prospectId,
        alert_id: ambiguousAlert.id,
        siren: picked.siren,
        siret: picked.siret,
      });
      if (result.ok) {
        toast.success(`SIREN ${picked.siren} associé`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (siren && !ambiguousAlert) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-emerald-600" aria-hidden />
          <strong className="font-mono">{siren}</strong>
          {sirenSource ? (
            <span className="bg-md-blue/10 text-md-blue rounded px-1.5 py-0.5 text-[10px] font-semibold">
              {sirenSource}
            </span>
          ) : null}
        </div>
        {sirenVerifiedAt ? (
          <p className="text-md-text-muted mt-1 text-xs">
            Vérifié le {new Date(sirenVerifiedAt).toLocaleDateString('fr-FR')}
          </p>
        ) : null}
      </div>
    );
  }

  if (ambiguousAlert) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-amber-700">
          <Search className="size-4" aria-hidden />
          <span className="text-sm font-medium">
            {ambiguousAlert.candidates.length} SIREN candidats — sélection manuelle requise
          </span>
        </div>
        <div className="border-md-border space-y-1.5 rounded-md border bg-amber-50/60 p-3">
          {ambiguousAlert.candidates.map((c) => (
            <label key={c.siret} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="siren-candidate"
                checked={selectedSiret === c.siret}
                onChange={() => setSelectedSiret(c.siret)}
                className="mt-1"
              />
              <span>
                <strong className="font-mono">{c.siren}</strong>
                {c.siege ? (
                  <span className="bg-md-blue/10 text-md-blue ml-1 rounded px-1 text-[10px]">
                    siège
                  </span>
                ) : null}{' '}
                — {c.denomination ?? '—'}{' '}
                <span className="text-md-text-muted text-xs">({c.ville ?? '?'})</span>
                {c.address ? (
                  <div className="text-md-text-muted text-[10px]">{c.address}</div>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        <Button type="button" onClick={handleResolve} disabled={pending || !selectedSiret}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Valider ce SIREN
        </Button>
      </div>
    );
  }

  return (
    <p className="text-md-text-muted text-sm">
      Aucun SIREN associé. Re-check automatique au passage signup → prospect.
    </p>
  );
}
