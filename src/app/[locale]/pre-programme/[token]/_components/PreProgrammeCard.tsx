'use client';

/**
 * P16.x.PreProgrammeInteractive — card conférence cliquable (lien vers la page
 * détail) + chips pôles/track interactifs (toggle filtre via callbacks).
 * N'expose NI intervenants NI horaires (teaser).
 */

import Link from 'next/link';
import { CONFERENCE_TYPE_LABEL, type ConferenceType } from '@/lib/conferences/constants';
import type { PreProgrammeConference } from '@/lib/public/preprogramme/types';

/** 5 couleurs cycliques pour les chiffres clés. */
const KEY_FIGURE_COLORS = ['#294294', '#E94E8A', '#B3122F', '#2E8B57', '#D97706'];

const TRACK_BADGE = {
  mds_solutions: { label: 'MediaDays Solutions', cls: 'bg-[#294294] text-white' },
  prs_radio_audio: { label: 'Paris Radio Show', cls: 'bg-[#B3122F] text-white' },
} as const;

export function PreProgrammeCard({
  conference,
  locale,
  token,
  onPoleClick,
  onTrackClick,
}: {
  conference: PreProgrammeConference;
  locale: 'fr' | 'en';
  token: string;
  onPoleClick?: (poleCode: string) => void;
  onTrackClick?: (track: 'mds' | 'prs') => void;
}) {
  const trackKey = conference.track;
  const trackBadge = TRACK_BADGE[trackKey];
  const trackShort = trackKey === 'mds_solutions' ? 'mds' : 'prs';
  const typeLabel = conference.conferenceType
    ? (CONFERENCE_TYPE_LABEL[conference.conferenceType as ConferenceType] ??
      conference.conferenceType)
    : null;
  const href = conference.slug
    ? `/${locale}/pre-programme/${token}/${conference.slug}`
    : `/${locale}/pre-programme/${token}`;

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#294294]/30 hover:shadow-xl"
    >
      {/* Header : badge track + chips pôles (interactifs) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTrackClick?.(trackShort);
          }}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${trackBadge.cls}`}
        >
          {trackBadge.label}
        </button>
        {conference.poles.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPoleClick?.(p.code);
            }}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white transition hover:opacity-80"
            style={{ backgroundColor: p.colorHex }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {typeLabel && (
        <span className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
          {typeLabel}
        </span>
      )}

      <h3 className="font-display text-lg leading-snug font-bold text-[#1F2240] group-hover:text-[#294294]">
        {conference.title}
      </h3>

      {conference.description && (
        <p className="mt-2 line-clamp-4 text-sm text-[#5A6080]">{conference.description}</p>
      )}

      {conference.keyFigures.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold tracking-widest text-[#5A6080] uppercase">
            📊 {locale === 'fr' ? 'Chiffres clés' : 'Key figures'}
          </span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {conference.keyFigures.slice(0, 3).map((fig, i) => (
              <li
                key={i}
                className="rounded-lg px-2.5 py-1.5 text-xs leading-snug"
                style={{
                  backgroundColor: `${KEY_FIGURE_COLORS[i % KEY_FIGURE_COLORS.length]}14`,
                  color: KEY_FIGURE_COLORS[i % KEY_FIGURE_COLORS.length],
                }}
              >
                {fig}
              </li>
            ))}
            {conference.keyFigures.length > 3 && (
              <li className="text-md-text-muted text-[11px]">
                +{conference.keyFigures.length - 3} {locale === 'fr' ? 'autres' : 'more'}
              </li>
            )}
          </ul>
        </div>
      )}

      {conference.targetAudience && (
        <p
          className="text-md-text-muted mt-4 line-clamp-2 border-t border-slate-100 pt-3 text-xs italic"
          title={conference.targetAudience}
        >
          🎯 {locale === 'fr' ? 'Cible' : 'Target'} : {conference.targetAudience}
        </p>
      )}

      <span className="mt-5 text-sm font-semibold text-[#294294] group-hover:underline">
        {locale === 'fr' ? 'Voir le détail →' : 'See details →'}
      </span>
    </Link>
  );
}
