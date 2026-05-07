'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MirrorRow {
  sellsy_item_id: number;
  reference: string;
  name: string | null;
  description: string | null;
  price_excl_tax: number | null;
  is_archived: boolean;
  synced_at: string;
}

/**
 * Tableau client des items du mirror Sellsy avec :
 *   - Recherche fuzzy sur reference + name
 *   - Toggle "afficher les items archivés"
 *   - Tri par reference (asc) par defaut, on respecte l'ordre serveur.
 *
 * Les actions (re-sync, divergences) sont rendues par les composants
 * parents server-side. Ici on gere uniquement la presentation.
 */
export function SellsyProductsTable({ items }: { items: MirrorRow[] }) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (!showArchived && it.is_archived) return false;
      if (!q) return true;
      return it.reference.toLowerCase().includes(q) || (it.name ?? '').toLowerCase().includes(q);
    });
  }, [items, query, showArchived]);

  return (
    <div className="bg-card border-md-border rounded-xl border shadow-sm">
      <div className="border-md-border flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par référence ou nom…"
            className="pl-8"
          />
        </div>
        <label className="text-md-text-muted flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="size-3.5"
          />
          Afficher archivés
        </label>
        <span className="text-md-text-muted ml-auto text-xs">
          {filtered.length} / {items.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-md-border bg-md-bg text-md-text-muted border-b text-left text-xs tracking-wide uppercase">
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2 text-right">Prix HT</th>
              <th className="px-3 py-2">Item ID</th>
              <th className="px-3 py-2">Last sync</th>
              <th className="px-3 py-2">État</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-md-text-muted px-3 py-6 text-center text-sm italic">
                  {items.length === 0
                    ? 'Mirror vide — lancez une re-sync.'
                    : 'Aucun résultat pour ce filtre.'}
                </td>
              </tr>
            ) : (
              filtered.map((it) => (
                <tr
                  key={it.sellsy_item_id}
                  className="border-md-border/50 hover:bg-md-bg/50 border-b last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-xs">{it.reference}</td>
                  <td className="px-3 py-2">{it.name ?? <em>—</em>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.price_excl_tax != null ? formatEur(Number(it.price_excl_tax)) : '—'}
                  </td>
                  <td className="text-md-text-muted px-3 py-2 font-mono text-xs">
                    {it.sellsy_item_id}
                  </td>
                  <td className="text-md-text-muted px-3 py-2 text-xs">
                    {formatDate(it.synced_at)}
                  </td>
                  <td className="px-3 py-2">
                    {it.is_archived ? (
                      <span className="bg-md-warning/10 text-md-warning rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                        Archivé
                      </span>
                    ) : (
                      <span className="bg-md-success/10 text-md-success rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                        Actif
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
