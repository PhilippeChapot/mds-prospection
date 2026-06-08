'use client';

/**
 * P6.x.SellsyDedupClient — autocomplete picker pour choisir un client Sellsy.
 *
 * Recherche live (debounce 300ms) via searchSellsyClientsAction. Affiche
 * jusqu'à 10 résultats (nom + SIREN + email).
 *
 * 'use client' : useState + onChange + onClick.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import {
  searchSellsyClientsAction,
  type SellsyClientLite,
} from '@/lib/admin/companies/sellsy-link-actions';

type Props = {
  /** Query pré-remplie (typiquement le nom MDS de la company). */
  initialQuery?: string;
  onPicked: (sellsyId: string, sellsyName: string) => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function SellsyClientSearchPicker({
  initialQuery = '',
  onPicked,
  onCancel,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SellsyClientLite[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger search au montage si initialQuery >= 2 chars. Debounce 300ms.
  // Eslint react-hooks/set-state-in-effect : on garde le pattern setState
  // dans l'effet car c est le cas légitime (debounced async fetch + cleanup).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
     
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchSellsyClientsAction({ q: query.trim() });
      setResults(r);
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="border-md-border bg-card space-y-3 rounded-lg border p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Search className="text-md-text-muted size-4" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de société, SIREN (9 chiffres) ou email…"
          disabled={disabled}
          autoFocus
          className="border-md-border bg-card text-md-text focus:border-md-blue flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          aria-label="Annuler"
          className="text-md-text-muted hover:text-md-text p-1 disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {loading ? (
        <p className="text-md-text-muted text-xs">Recherche dans Sellsy…</p>
      ) : query.trim().length < 2 ? (
        <p className="text-md-text-muted text-xs">
          Tapez au moins 2 caractères pour lancer la recherche.
        </p>
      ) : results.length === 0 ? (
        <p className="text-md-text-muted text-xs">Aucun client Sellsy trouvé.</p>
      ) : (
        <ul className="divide-md-border max-h-96 divide-y overflow-y-auto">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPicked(c.id, c.name)}
                disabled={disabled}
                className="hover:bg-muted w-full px-2 py-2 text-left text-sm disabled:opacity-50"
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
    </div>
  );
}
