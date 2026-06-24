/**
 * P16.x.PreProgrammeTeaser — section track (hero secondaire MDS bleu / PRS
 * rouge + grille de cards). Server component.
 */

import type { PreProgrammeLabels } from './labels';
import type { PreProgrammeConference } from '@/lib/public/preprogramme/types';
import { PreProgrammeCard } from './PreProgrammeCard';

interface Props {
  variant: 'mds' | 'prs';
  title: string;
  tagline: string;
  conferences: PreProgrammeConference[];
  labels: PreProgrammeLabels;
}

const VARIANT = {
  mds: { bg: 'from-[#294294] to-[#1F2240]', accent: '#294294' },
  prs: { bg: 'from-[#B3122F] to-[#7A0C20]', accent: '#B3122F' },
} as const;

export function PreProgrammeTrackSection({ variant, title, tagline, conferences, labels }: Props) {
  if (conferences.length === 0) return null;
  const v = VARIANT[variant];
  return (
    <section>
      <div className={`bg-gradient-to-br px-6 py-14 text-center text-white ${v.bg}`}>
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{title}</h2>
        <p className="mt-2 text-white/75">{tagline}</p>
        <p className="mt-4 text-sm font-semibold text-white/60">
          {conferences.length} {labels.confSuffix}
        </p>
      </div>
      <div className="bg-slate-50 px-6 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {conferences.map((c) => (
            <PreProgrammeCard key={c.id} conference={c} labels={labels} accent={v.accent} />
          ))}
        </div>
      </div>
    </section>
  );
}
