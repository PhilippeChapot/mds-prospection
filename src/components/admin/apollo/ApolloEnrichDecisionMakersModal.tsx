'use client';

/**
 * P5.x.SmartAddApolloEnrichment — modale « décideurs Apollo ».
 *
 * Ouverte après confirmSmartAdd : recherche les décideurs ciblés de la
 * company, pré-sélectionne les candidats priorité 1, et crée les contacts
 * choisis. Réutilisable via Dialog shadcn.
 */

import { useEffect, useState, useTransition } from 'react';
import { Loader2, ExternalLink, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  searchApolloDecisionMakersAction,
  createContactsFromApolloCandidatesAction,
} from '@/lib/admin/apollo/search-decision-makers';
import type { ApolloDecisionMakerCandidate } from '@/lib/admin/apollo/types';

interface Props {
  companyId: string;
  onClose: () => void;
  /** Appelé après création réussie (ex: pour rafraîchir la fiche). */
  onCreated?: (created: number) => void;
}

/**
 * Monté uniquement quand ouvert (cf. ApolloDecisionMakersBanner) → l'effet de
 * recherche tourne une fois au montage et ne fait du setState que dans les
 * callbacks async (pas de setState synchrone dans l'effet). `candidates=null`
 * = état de chargement.
 */
export function ApolloEnrichDecisionMakersModal({ companyId, onClose, onCreated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ApolloDecisionMakerCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const loading = candidates === null && error === null;

  useEffect(() => {
    let cancelled = false;
    searchApolloDecisionMakersAction({ company_id: companyId })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error ?? 'Recherche Apollo échouée.');
          return;
        }
        setCandidates(res.candidates);
        // Pré-sélection : tous les candidats priorité 1.
        setSelected(new Set(res.candidates.filter((c) => c.priority === 1).map((c) => c.apolloId)));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const list = candidates ?? [];

  function handleCreate() {
    const chosen = list.filter((c) => selected.has(c.apolloId));
    if (chosen.length === 0) return;
    startTransition(async () => {
      try {
        const res = await createContactsFromApolloCandidatesAction({
          company_id: companyId,
          candidates: chosen.map((c) => ({
            firstName: c.firstName,
            lastName: c.lastName,
            title: c.title,
            linkedinUrl: c.linkedinUrl,
            email: c.email,
          })),
        });
        if (!res.ok) {
          toast.error(res.error ?? 'Création échouée.');
          return;
        }
        toast.success(
          `${res.created} contact(s) ajouté(s)${res.skipped > 0 ? ` · ${res.skipped} ignoré(s) (déjà présent)` : ''}.`,
        );
        onCreated?.(res.created);
        onClose();
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  const selectedCount = selected.size;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🎯 Décideurs Apollo</DialogTitle>
          <DialogDescription>
            Décisionnaires ciblés de cette société (direction, marketing, communication). Les cibles
            prioritaires sont pré-cochées.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {loading && (
            <div className="text-md-text-muted flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche Apollo…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <p className="text-md-text-muted py-6 text-sm">
              Aucun décideur ciblé trouvé pour cette société (ou tous déjà présents).
            </p>
          )}
          {list.map((c) => {
            const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(sans nom)';
            return (
              <label
                key={c.apolloId}
                className="border-md-border hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md border p-2.5"
              >
                <Checkbox
                  checked={selected.has(c.apolloId)}
                  onCheckedChange={() => toggle(c.apolloId)}
                />
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.photoUrl}
                    alt=""
                    className="size-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="bg-md-blue/10 text-md-blue flex size-9 items-center justify-center rounded-full text-xs font-bold">
                    {(c.firstName?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-md-text truncate text-sm font-semibold">{fullName}</span>
                    {c.priority === 1 && (
                      <Star
                        className="size-3 fill-amber-400 text-amber-400"
                        aria-label="prioritaire"
                      />
                    )}
                  </div>
                  <div className="text-md-text-muted truncate text-xs">{c.title ?? '—'}</div>
                </div>
                {c.linkedinUrl && (
                  <a
                    href={c.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-md-blue hover:text-md-blue-dark shrink-0"
                    title="Profil LinkedIn"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="button" onClick={handleCreate} disabled={pending || selectedCount === 0}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Ajouter {selectedCount} contact{selectedCount > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
