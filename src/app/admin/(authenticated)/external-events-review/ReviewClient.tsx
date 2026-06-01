'use client';

/**
 * P5.x.ExternalEvents — composant client gerant tabs + actions par card.
 *
 * Tabs : md_classic / rde / satis / cbd (counts affiches).
 * Chaque card : nom, source, badges tags, contact count + 3 boutons :
 *   - "Suggerer matches" (lazy : appelle suggestMatchesForUnverifiedAction)
 *   - "Valider tel quel"
 *   - "Ignorer" (visible super_admin only)
 * Si suggestions chargees : liste avec score + bouton "Fusionner ici".
 */

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ExternalEventBadges } from '@/components/admin/ExternalEventBadges';
import type { ExternalEventSource } from '@/lib/external-events/types';
import {
  mergeUnverifiedCompanyAction,
  validateUnverifiedCompanyAction,
  ignoreUnverifiedCompanyAction,
  suggestMatchesForUnverifiedAction,
} from './actions';

interface UnverifiedRow {
  id: string;
  name: string;
  source: ExternalEventSource;
  tags: Record<string, unknown>;
  contactCount: number;
}

interface Props {
  rows: UnverifiedRow[];
  activeTab: ExternalEventSource;
  counts: Record<ExternalEventSource, number>;
  canIgnore: boolean;
}

const SOURCE_LABELS: Record<ExternalEventSource, string> = {
  md_classic: 'MD Classic',
  rde: 'RDE',
  satis: 'SATIS',
  cbd: 'CBD',
};

export function ReviewClient({ rows, activeTab, counts, canIgnore }: Props) {
  const sources: ExternalEventSource[] = ['md_classic', 'rde', 'satis', 'cbd'];

  return (
    <div className="space-y-4">
      <div className="border-md-border bg-card flex flex-wrap gap-1.5 rounded-xl border p-2 shadow-sm">
        {sources.map((s) => (
          <Link
            key={s}
            href={`/admin/external-events-review?tab=${s}`}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              s === activeTab ? 'bg-md-magenta text-white' : 'hover:bg-muted'
            }`}
          >
            {SOURCE_LABELS[s]} <span className="opacity-70">({counts[s]})</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border-md-border bg-card rounded-xl border p-8 text-center shadow-sm">
          <p className="text-md-text-muted text-sm">
            Aucune company unverified pour {SOURCE_LABELS[activeTab]}.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ReviewCard key={row.id} row={row} canIgnore={canIgnore} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ row, canIgnore }: { row: UnverifiedRow; canIgnore: boolean }) {
  const [pending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<Array<{
    id: string;
    name: string;
    score: number;
  }> | null>(null);
  const [suggestLoaded, setSuggestLoaded] = useState(false);

  function onSuggest() {
    startTransition(async () => {
      const r = await suggestMatchesForUnverifiedAction({ unverifiedId: row.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSuggestions(r.suggestions);
      setSuggestLoaded(true);
    });
  }

  function onValidate() {
    if (!confirm(`Valider "${row.name}" tel quel (statut -> verified) ?`)) return;
    startTransition(async () => {
      const r = await validateUnverifiedCompanyAction({ unverifiedId: row.id });
      if (!r.ok) toast.error(r.error);
      else toast.success('Validée.');
    });
  }

  function onIgnore() {
    if (
      !confirm(
        `Ignorer "${row.name}" ?\nLes contacts importés depuis cette source seront SUPPRIMÉS.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await ignoreUnverifiedCompanyAction({ unverifiedId: row.id });
      if (!r.ok) toast.error(r.error);
      else toast.success('Ignorée.');
    });
  }

  function onMerge(targetId: string, targetName: string) {
    if (
      !confirm(
        `Fusionner "${row.name}" dans "${targetName}" ?\nContacts transferes, source supprimee.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await mergeUnverifiedCompanyAction({
        unverifiedId: row.id,
        targetCompanyId: targetId,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success('Fusionnée.');
    });
  }

  return (
    <li className="border-md-border bg-card space-y-2 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-md-text font-bold">{row.name}</div>
          <div className="mt-1">
            <ExternalEventBadges tags={row.tags} size="sm" />
          </div>
          <p className="text-md-text-muted mt-1 text-xs">
            {row.contactCount} contact{row.contactCount > 1 ? 's' : ''} importé
            {row.contactCount > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!suggestLoaded && (
            <Button size="sm" variant="outline" disabled={pending} onClick={onSuggest}>
              💡 Suggérer matches
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={onValidate}>
            ✓ Valider tel quel
          </Button>
          {canIgnore && (
            <Button size="sm" variant="destructive" disabled={pending} onClick={onIgnore}>
              ✗ Ignorer
            </Button>
          )}
        </div>
      </div>

      {suggestLoaded && (
        <div className="border-md-border bg-md-bg-soft mt-2 space-y-2 rounded-md border p-3">
          <p className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Matches potentiels (Levenshtein ≥ 0.7)
          </p>
          {suggestions && suggestions.length > 0 ? (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-white p-2 text-sm"
                >
                  <div>
                    <strong className="text-md-text">{s.name}</strong>{' '}
                    <span className="text-md-text-muted text-xs">
                      ({Math.round(s.score * 100)}%)
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onMerge(s.id, s.name)}
                  >
                    Fusionner ici
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-md-text-muted text-xs">Aucun match suffisamment proche.</p>
          )}
        </div>
      )}
    </li>
  );
}
