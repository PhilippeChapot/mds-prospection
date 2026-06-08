'use client';

/**
 * P6.x.SellsyDedupClient-HOTFIX2 BUG 3 — drawer pour lister toutes les
 * companies Sellsy + filter local + click pour sélectionner.
 *
 * Cas d'usage : Phil ne trouve pas le client via search (raison sociale
 * très différente du nom marque MDS) → click "Voir tout" → scroller la
 * liste alphabétique des companies Sellsy et choisir manuellement.
 *
 * UX :
 *   - Sheet right-side w-[600px], header fixe avec input filter
 *   - Liste scrollable paginée (50/page) — bouton "Charger plus"
 *   - Filter input fait du substring match côté JS sur la page courante
 *     (pas de re-fetch tant qu'on n'a pas chargé plus de pages)
 *   - Click row → onPicked(id, name) + ferme le drawer
 *
 * 'use client' : useState + onClick + useEffect fetch.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import {
  listAllSellsyClientsAction,
  type SellsyClientLite,
} from '@/lib/admin/companies/sellsy-link-actions';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (sellsyId: string, sellsyName: string) => void;
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SellsyClientBrowseAllDrawer({ open, onOpenChange, onPicked }: Props) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<SellsyClientLite[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const loadPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const r = await listAllSellsyClientsAction({ page: pageNum, limit: 50 });
    setItems((prev) => (pageNum === 0 ? r.data : [...prev, ...r.data]));
    setHasMore(r.has_more);
    setLoading(false);
  }, []);

  // Charge page 0 au premier ouvert.
  useEffect(() => {
    if (!open) return;
    if (items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void loadPage(next);
  }

  // Filter local côté JS sur la page courante.
  const filterNorm = normalize(filter);
  const filtered =
    filterNorm.length < 2
      ? items
      : items.filter((c) => {
          const nameMatch = normalize(c.name).includes(filterNorm);
          const sirenMatch = c.siren ? c.siren.includes(filterNorm.replace(/\s/g, '')) : false;
          return nameMatch || sirenMatch;
        });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px]">
        <div className="border-md-border bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-md-blue-dark text-base font-bold">
              Toutes les sociétés Sellsy
            </SheetTitle>
            <SheetDescription className="text-md-text-muted mt-0.5 text-xs">
              {items.length} chargées · ordre alphabétique. Filtre local en haut.
            </SheetDescription>
          </div>
          <SheetClose aria-label="Fermer" className="text-md-text-muted hover:text-md-text p-1">
            <X className="size-4" aria-hidden />
          </SheetClose>
        </div>

        <div className="border-md-border bg-md-bg/30 sticky top-[60px] z-10 border-b px-5 py-3">
          <div className="border-md-border bg-card flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Search className="text-md-text-muted size-4" aria-hidden />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtre local sur les sociétés chargées (nom, SIREN)…"
              className="text-md-text flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading && items.length === 0 ? (
            <p className="text-md-text-muted py-12 text-center text-sm">
              Chargement des sociétés Sellsy…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-md-text-muted py-12 text-center text-sm">
              {filterNorm.length >= 2
                ? 'Aucune société Sellsy ne matche ce filtre dans les pages chargées.'
                : 'Aucune société Sellsy.'}
            </p>
          ) : (
            <ul className="divide-md-border divide-y">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPicked(c.id, c.name);
                      onOpenChange(false);
                    }}
                    className="hover:bg-muted w-full px-2 py-2.5 text-left text-sm"
                  >
                    <div className="text-md-text font-semibold">{c.name}</div>
                    <div className="text-md-text-muted flex flex-wrap gap-x-3 text-xs">
                      <span>
                        ID <code>{c.id}</code>
                      </span>
                      {c.siren ? <span>· SIREN {c.siren}</span> : null}
                      {c.email ? <span>· {c.email}</span> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasMore && !loading ? (
            <div className="py-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                className="text-md-blue hover:text-md-blue-dark text-xs font-semibold hover:underline"
              >
                Charger 50 sociétés Sellsy de plus →
              </button>
            </div>
          ) : null}
          {loading && items.length > 0 ? (
            <p className="text-md-text-muted py-3 text-center text-xs">Chargement…</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
