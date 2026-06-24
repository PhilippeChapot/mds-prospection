'use client';

/**
 * P16.x.PreProgrammeInteractive — wrapper client : filtres dans l'URL
 * (track/poles/types/q, partageable), recherche debouncée 300ms, filtrage
 * local instantané, grille de cards + empty state.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  filterConferences,
  derivePoleCounts,
  deriveTypeCounts,
} from '@/lib/public/preprogramme/filter';
import type { PreProgrammeConference } from '@/lib/public/preprogramme/types';
import { PreProgrammeFiltersBar } from './PreProgrammeFiltersBar';
import { PreProgrammeCard } from './PreProgrammeCard';

export function PreProgrammeInteractive({
  conferences,
  locale,
  token,
}: {
  conferences: PreProgrammeConference[];
  locale: 'fr' | 'en';
  token: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const trackFilter = searchParams.get('track') ?? 'all';
  const polesFilter = (searchParams.get('poles')?.split(',') ?? []).filter(Boolean);
  const typesFilter = (searchParams.get('types')?.split(',') ?? []).filter(Boolean);
  const queryParam = searchParams.get('q') ?? '';

  const [searchQuery, setSearchQuery] = useState(queryParam);

  // Debounce recherche → URL.
  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      else params.delete('q');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function updateFilter(key: 'track' | 'poles' | 'types', value: string | string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (Array.isArray(value)) {
      if (value.length === 0) params.delete(key);
      else params.set(key, value.join(','));
    } else if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function togglePole(code: string) {
    updateFilter(
      'poles',
      polesFilter.includes(code) ? polesFilter.filter((p) => p !== code) : [...polesFilter, code],
    );
  }
  function toggleType(type: string) {
    updateFilter(
      'types',
      typesFilter.includes(type) ? typesFilter.filter((t) => t !== type) : [...typesFilter, type],
    );
  }
  function resetFilters() {
    setSearchQuery('');
    router.replace(pathname, { scroll: false });
  }

  const filtered = useMemo(
    () =>
      filterConferences(conferences, {
        track: trackFilter,
        poles: polesFilter,
        types: typesFilter,
        q: queryParam,
      }),
    [conferences, trackFilter, polesFilter, typesFilter, queryParam],
  );

  const polesWithCounts = useMemo(() => derivePoleCounts(conferences), [conferences]);
  const typesWithCounts = useMemo(() => deriveTypeCounts(conferences), [conferences]);

  const hasFilters =
    trackFilter !== 'all' ||
    polesFilter.length > 0 ||
    typesFilter.length > 0 ||
    queryParam.trim() !== '';

  const count = filtered.length;
  const countLabel =
    locale === 'fr'
      ? `${count} conférence${count > 1 ? 's' : ''} correspond${count > 1 ? 'ent' : ''} à vos critères`
      : `${count} conference${count > 1 ? 's' : ''} match your criteria`;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      <PreProgrammeFiltersBar
        locale={locale}
        totalConferences={conferences.length}
        trackFilter={trackFilter}
        polesFilter={polesFilter}
        typesFilter={typesFilter}
        polesWithCounts={polesWithCounts}
        typesWithCounts={typesWithCounts}
        searchQuery={searchQuery}
        hasFilters={hasFilters}
        onTrackChange={(v) => updateFilter('track', v)}
        onTogglePole={togglePole}
        onToggleType={toggleType}
        onSearchChange={setSearchQuery}
        onReset={resetFilters}
      />

      <p className="mt-6 mb-4 text-sm text-slate-600">{countLabel}</p>

      {count === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <p className="mb-3 text-5xl">🔍</p>
          <h3 className="text-lg font-bold text-slate-700">
            {locale === 'fr' ? 'Aucune conférence ne correspond' : 'No conference matches'}
          </h3>
          <p className="mt-2 mb-6 text-sm text-slate-500">
            {locale === 'fr'
              ? 'Élargissez vos critères ou réinitialisez les filtres.'
              : 'Broaden your criteria or reset the filters.'}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg bg-[#294294] px-6 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            ↺ {locale === 'fr' ? 'Réinitialiser' : 'Reset'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((conf) => (
            <PreProgrammeCard
              key={conf.id}
              conference={conf}
              locale={locale}
              token={token}
              onPoleClick={togglePole}
              onTrackClick={(v) => updateFilter('track', v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
