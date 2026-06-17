'use client';

/**
 * P7.x.AffiliateManualCompanyAttach — modale super_admin : rechercher une
 * société (RPC fuzzy) et l'attacher à cet affilié. Les sociétés déjà
 * attribuées (claim actif) sont grisées et non sélectionnables.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  searchAvailableCompaniesAction,
  type CompanySearchHit,
} from '@/lib/affiliate-claims/manual-attach-actions';
import { createManualAffiliateClaimAction } from '@/lib/admin/affiliate-claims/manual-create-action';

export function AttachCompanyDialog({
  affiliateId,
  affiliateName,
}: {
  affiliateId: string;
  affiliateName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CompanySearchHit[]>([]);
  const [selected, setSelected] = useState<CompanySearchHit | null>(null);
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery('');
      setHits([]);
      setSelected(null);
    }
  }

  function runSearch(q: string) {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const r = await searchAvailableCompaniesAction({ query: q });
      if (r.ok) setHits(r.data);
      else toast.error(r.error);
    });
  }

  function handleAttach() {
    if (!selected) return;
    startSubmit(async () => {
      const r = await createManualAffiliateClaimAction({
        affiliate_id: affiliateId,
        company_id: selected.id,
      });
      if (r.ok) {
        toast.success(`${selected.name} attachée à ${affiliateName}.`);
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Attacher une société
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attacher une société à {affiliateName}</DialogTitle>
            <DialogDescription>
              Crée une attribution manuelle (source super_admin). La société sera attribuée à cet
              affilié pour ses futurs prospects.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="text-md-text-muted absolute top-2.5 left-2.5 size-4" aria-hidden />
              <input
                type="search"
                autoFocus
                placeholder="Rechercher une société (nom, domaine)…"
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                className="border-md-border focus-visible:border-md-magenta/40 w-full rounded-md border py-2 pr-3 pl-8 text-sm focus:outline-none"
              />
            </div>

            <div className="border-md-border max-h-[240px] overflow-y-auto rounded-md border">
              {searching ? (
                <p className="text-md-text-muted flex items-center justify-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche…
                </p>
              ) : hits.length === 0 ? (
                <p className="text-md-text-muted py-6 text-center text-sm">
                  {query.trim().length < 2
                    ? 'Tapez au moins 2 caractères.'
                    : 'Aucune société trouvée.'}
                </p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {hits.map((h) => {
                    const disabled = h.already_claimed;
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelected(h)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                            disabled
                              ? 'cursor-not-allowed opacity-50'
                              : selected?.id === h.id
                                ? 'bg-md-magenta/10'
                                : 'hover:bg-muted'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="text-md-text line-clamp-1 font-semibold">
                              {h.name}
                            </span>
                            {h.primary_domain ? (
                              <span className="text-md-text-muted line-clamp-1 text-[11px]">
                                {h.primary_domain}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase">
                            {disabled ? (
                              <span className="text-md-warning">déjà attribuée</span>
                            ) : h.match_type === 'fuzzy' ? (
                              <span className="text-md-text-muted">proche ?</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
            <Button type="button" onClick={handleAttach} disabled={!selected || submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Attacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
