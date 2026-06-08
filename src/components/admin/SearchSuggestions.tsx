'use client';

/**
 * P5.x.SearchFuzzy — chips de suggestions "vouliez-vous dire".
 *
 * Doctrine [[feedback_check_use_client_before_event_handlers]] (incident
 * hotfix #81) : ce composant a un onClick → DOIT etre 'use client'.
 *
 * Click sur une suggestion → router.push(?q=<label>) en preservant les
 * autres searchParams (pole/status/etc.).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Lightbulb } from 'lucide-react';

export interface SearchSuggestionChip {
  id: string;
  label: string;
}

interface Props {
  suggestions: SearchSuggestionChip[];
  /** Nom du searchParam (default: 'q'). */
  paramKey?: string;
  /** Title de la section (i18n). Default: "Vouliez-vous dire :" FR. */
  title?: string;
}

export function SearchSuggestions({ suggestions, paramKey = 'q', title }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!suggestions || suggestions.length === 0) return null;

  function handleClick(label: string) {
    const params = new URLSearchParams(searchParams);
    params.set(paramKey, label);
    // Reset pagination quand on change la query.
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="border-md-border bg-muted/40 mt-4 rounded-lg border border-dashed p-4">
      <p className="text-md-text-muted mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <Lightbulb className="size-3.5" aria-hidden />
        {title ?? 'Vouliez-vous dire :'}
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleClick(s.label)}
            className="border-md-border bg-card text-md-text hover:bg-md-magenta hover:border-md-magenta rounded-full border px-3 py-1 text-xs font-medium transition hover:text-white"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
