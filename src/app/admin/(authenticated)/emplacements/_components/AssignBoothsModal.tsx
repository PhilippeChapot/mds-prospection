'use client';

/**
 * P6.x.MultiBooths — modale d'assignation *groupée* de stands à un prospect,
 * déclenchée depuis le mode multi-sélection du plan des emplacements.
 *
 * Flux : l'admin a coché N stands libres sur le plan → cette modale propose un
 * autocomplete prospect, un récap des blocs sélectionnés, et le choix
 * ajouter/remplacer. Confirme via setProspectBoothsAction.
 */

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  setProspectBoothsAction,
  searchProspectsForBoothAssign,
  type ProspectSearchHit,
} from '@/lib/admin/stands/multi-booth-actions';

export function AssignBoothsModal({
  open,
  onOpenChange,
  boothIds,
  boothNumbers,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boothIds: string[];
  boothNumbers: string[];
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProspectSearchHit[]>([]);
  const [selected, setSelected] = useState<ProspectSearchHit | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const recap = useMemo(
    () =>
      boothNumbers
        .slice()
        .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
        .join(', '),
    [boothNumbers],
  );

  function reset() {
    setQuery('');
    setHits([]);
    setSelected(null);
    setReplaceExisting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function runSearch(q: string) {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const r = await searchProspectsForBoothAssign({ query: q });
      if (r.ok) setHits(r.data);
      else toast.error(r.error);
    });
  }

  function handleConfirm() {
    if (!selected) return;
    startSubmit(async () => {
      const r = await setProspectBoothsAction({
        prospect_id: selected.id,
        booth_ids: boothIds,
        mode: replaceExisting ? 'replace' : 'append',
      });
      if (r.ok) {
        toast.success(
          `${boothIds.length} bloc${boothIds.length > 1 ? 's' : ''} assigné${
            boothIds.length > 1 ? 's' : ''
          } à ${selected.company_name}.`,
        );
        reset();
        onAssigned();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assigner {boothIds.length} bloc{boothIds.length > 1 ? 's' : ''} à un prospect
          </DialogTitle>
          <DialogDescription>
            Blocs sélectionnés : <span className="text-md-text font-semibold">{recap}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="text-md-text-muted absolute top-2.5 left-2.5 size-4" aria-hidden />
            <input
              type="search"
              autoFocus
              placeholder="Rechercher un prospect (société)…"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              className="border-md-border focus-visible:border-md-magenta/40 w-full rounded-md border py-2 pr-3 pl-8 text-sm focus:outline-none"
            />
          </div>

          <div className="border-md-border max-h-[220px] overflow-y-auto rounded-md border">
            {searching ? (
              <p className="text-md-text-muted flex items-center justify-center gap-2 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche…
              </p>
            ) : hits.length === 0 ? (
              <p className="text-md-text-muted py-6 text-center text-sm">
                {query.trim().length < 2
                  ? 'Tapez au moins 2 caractères.'
                  : 'Aucun prospect trouvé.'}
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(h)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                        selected?.id === h.id ? 'bg-md-magenta/10' : 'hover:bg-muted'
                      }`}
                    >
                      <span className="text-md-text line-clamp-1 font-semibold">
                        {h.company_name}
                      </span>
                      <span className="text-md-text-muted shrink-0 text-[10px] uppercase">
                        {h.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="text-md-text-muted flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="accent-md-magenta size-3.5"
            />
            Remplacer les blocs existants du prospect (sinon : ajout aux blocs déjà détenus)
          </label>
          {replaceExisting ? (
            <p className="text-xs font-medium text-orange-600">
              ⚠️ Les blocs actuels du prospect non listés ci-dessus seront libérés.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!selected || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Confirmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
