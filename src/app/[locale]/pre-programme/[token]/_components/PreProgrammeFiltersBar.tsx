'use client';

/**
 * P16.x.PreProgrammeInteractive — barre de filtres (Événement / Pôles /
 * Format / Recherche) + reset. Tout client, piloté par PreProgrammeInteractive.
 */

import { CONFERENCE_TYPE_LABEL, type ConferenceType } from '@/lib/conferences/constants';

interface PoleCount {
  code: string;
  name: string;
  colorHex: string;
  count: number;
}
interface TypeCount {
  type: string;
  count: number;
}

interface Props {
  locale: 'fr' | 'en';
  totalConferences: number;
  trackFilter: string;
  polesFilter: string[];
  typesFilter: string[];
  polesWithCounts: PoleCount[];
  typesWithCounts: TypeCount[];
  searchQuery: string;
  hasFilters: boolean;
  onTrackChange: (v: string) => void;
  onTogglePole: (code: string) => void;
  onToggleType: (type: string) => void;
  onSearchChange: (v: string) => void;
  onReset: () => void;
}

function Chip({
  active,
  onClick,
  label,
  activeStyle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeStyle?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? activeStyle : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
        active
          ? 'border-transparent bg-[#1F2240] text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  );
}

export function PreProgrammeFiltersBar({
  locale,
  totalConferences,
  trackFilter,
  polesFilter,
  typesFilter,
  polesWithCounts,
  typesWithCounts,
  searchQuery,
  hasFilters,
  onTrackChange,
  onTogglePole,
  onToggleType,
  onSearchChange,
  onReset,
}: Props) {
  const t = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {/* Événement */}
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
          {t('Événement', 'Event')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip
            active={trackFilter === 'all'}
            onClick={() => onTrackChange('all')}
            label={t(`Tous (${totalConferences})`, `All (${totalConferences})`)}
          />
          <Chip
            active={trackFilter === 'mds'}
            onClick={() => onTrackChange('mds')}
            label="MediaDays Solutions"
            activeStyle={{ backgroundColor: '#294294' }}
          />
          <Chip
            active={trackFilter === 'prs'}
            onClick={() => onTrackChange('prs')}
            label="Paris Radio Show"
            activeStyle={{ backgroundColor: '#B3122F' }}
          />
        </div>
      </div>

      {/* Pôles */}
      {polesWithCounts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
            {t('Pôles', 'Topics')}
          </p>
          <div className="flex flex-wrap gap-2">
            {polesWithCounts.map((p) => (
              <Chip
                key={p.code}
                active={polesFilter.includes(p.code)}
                onClick={() => onTogglePole(p.code)}
                label={`${p.name} (${p.count})`}
                activeStyle={{ backgroundColor: p.colorHex }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Format */}
      {typesWithCounts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
            {t('Format', 'Format')}
          </p>
          <div className="flex flex-wrap gap-2">
            {typesWithCounts.map((ty) => (
              <Chip
                key={ty.type}
                active={typesFilter.includes(ty.type)}
                onClick={() => onToggleType(ty.type)}
                label={`${CONFERENCE_TYPE_LABEL[ty.type as ConferenceType] ?? ty.type} (${ty.count})`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recherche */}
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
          {t('Recherche', 'Search')}
        </p>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t(
            'Rechercher dans les titres, pitchs, chiffres clés…',
            'Search titles, pitches, key figures…',
          )}
          className="w-full rounded-lg border-2 border-slate-200 px-4 py-2.5 text-sm focus:border-[#294294] focus:outline-none"
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-[#294294] hover:underline"
        >
          ↺ {t('Réinitialiser les filtres', 'Reset filters')}
        </button>
      )}
    </div>
  );
}
