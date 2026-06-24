/**
 * P16.x.PreProgrammeTeaser — card conférence immersive (hover). Server
 * component. N'expose NI intervenants NI horaires (teaser).
 */

import type { PreProgrammeLabels } from './labels';
import type { PreProgrammeConference } from '@/lib/public/preprogramme/types';

/** 5 couleurs cycliques pour les chiffres clés. */
const KEY_FIGURE_COLORS = ['#294294', '#E94E8A', '#B3122F', '#2E8B57', '#D97706'];

export function PreProgrammeCard({
  conference,
  labels,
  accent,
}: {
  conference: PreProgrammeConference;
  labels: PreProgrammeLabels;
  accent: string;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <span
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        style={{ backgroundColor: accent }}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {conference.poles.map((p) => (
          <span
            key={p.code}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: p.colorHex }}
          >
            {p.name}
          </span>
        ))}
      </div>
      <h3 className="font-display text-lg leading-snug font-bold text-[#1F2240]">
        {conference.title}
      </h3>
      {conference.description && (
        <p className="mt-2 line-clamp-3 text-sm text-[#5A6080]">{conference.description}</p>
      )}
      {conference.keyFigures.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold tracking-widest text-[#5A6080] uppercase">
            {labels.keyFigures}
          </span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {conference.keyFigures.map((fig, i) => (
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
          </ul>
        </div>
      )}
      {conference.targetAudience && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold tracking-widest text-[#5A6080] uppercase">
            {labels.targetAudience}
          </span>
          <p className="mt-1 line-clamp-3 text-sm text-[#1F2240]" title={conference.targetAudience}>
            {conference.targetAudience}
          </p>
        </div>
      )}
    </article>
  );
}
