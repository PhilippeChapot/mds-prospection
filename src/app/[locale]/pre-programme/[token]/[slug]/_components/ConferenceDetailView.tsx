/**
 * P16.x.PreProgrammeInteractive — vue détail d'une conférence (hero track +
 * pitch complet + chiffres clés + public cible + pôles cliquables). Server
 * component (uniquement des <Link>, aucun handler).
 */

import Link from 'next/link';
import { CONFERENCE_TYPE_LABEL, type ConferenceType } from '@/lib/conferences/constants';
import type { PreProgrammeConference } from '@/lib/public/preprogramme/types';

const KEY_FIGURE_COLORS = ['#294294', '#E94E8A', '#B3122F', '#2E8B57', '#D97706'];

const TRACK = {
  mds_solutions: {
    label: 'MediaDays Solutions',
    short: 'mds',
    bg: 'from-[#0b1437] via-[#1F2240] to-[#294294]',
  },
  prs_radio_audio: {
    label: 'Paris Radio Show',
    short: 'prs',
    bg: 'from-[#3b0410] via-[#7A0C20] to-[#B3122F]',
  },
} as const;

export function ConferenceDetailView({
  conference,
  locale,
  token,
}: {
  conference: PreProgrammeConference;
  locale: 'fr' | 'en';
  token: string;
}) {
  const t = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  const track = TRACK[conference.track];
  const base = `/${locale}/pre-programme/${token}`;
  const typeLabel = conference.conferenceType
    ? (CONFERENCE_TYPE_LABEL[conference.conferenceType as ConferenceType] ??
      conference.conferenceType)
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <header className={`bg-gradient-to-br px-6 py-16 text-white ${track.bg}`}>
        <div className="mx-auto max-w-4xl">
          <Link
            href={`${base}?track=${track.short}`}
            className="text-sm text-white/70 transition hover:text-white"
          >
            ← {t('Retour au pré-programme', 'Back to pre-programme')}
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href={`${base}?track=${track.short}`}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold transition hover:bg-white/25"
            >
              {track.label}
            </Link>
            {typeLabel && (
              <span className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold">
                {typeLabel}
              </span>
            )}
            {conference.poles.map((p) => (
              <Link
                key={p.code}
                href={`${base}?poles=${p.code}`}
                className="rounded-full px-3 py-1 text-xs font-semibold text-white transition hover:opacity-80"
                style={{ backgroundColor: p.colorHex }}
              >
                {p.name}
              </Link>
            ))}
          </div>
          <h1 className="font-display mt-5 text-4xl leading-tight font-extrabold md:text-5xl">
            {conference.title}
          </h1>
          <span className="mt-5 inline-block rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
            ⚠️ {t('Programme provisoire', 'Provisional programme')}
          </span>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-12">
        {conference.description && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-bold text-[#1F2240]">
              📝 {t('Le pitch', 'The pitch')}
            </h2>
            <p className="leading-relaxed whitespace-pre-line text-[#5A6080]">
              {conference.description}
            </p>
          </section>
        )}

        {conference.keyFigures.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-bold text-[#1F2240]">
              📊 {t('Chiffres clés', 'Key figures')}
            </h2>
            <ul className="flex flex-col gap-2">
              {conference.keyFigures.map((fig, i) => (
                <li
                  key={i}
                  className="rounded-lg px-3 py-2 text-sm leading-snug"
                  style={{
                    backgroundColor: `${KEY_FIGURE_COLORS[i % KEY_FIGURE_COLORS.length]}14`,
                    color: KEY_FIGURE_COLORS[i % KEY_FIGURE_COLORS.length],
                  }}
                >
                  {fig}
                </li>
              ))}
            </ul>
          </section>
        )}

        {conference.targetAudience && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-bold text-[#1F2240]">
              🎯 {t('Public cible', 'Target audience')}
            </h2>
            <p className="leading-relaxed text-[#5A6080]">{conference.targetAudience}</p>
          </section>
        )}

        {/* Footer CTA */}
        <div className="flex flex-wrap justify-center gap-3 pt-6">
          <Link
            href={`${base}?track=${track.short}`}
            className="rounded-full bg-[#294294] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
          >
            ← {t('Voir toutes les conférences', 'See all conferences')}
          </Link>
          <a
            href="https://www.mediadays.solutions/fr/inscription-partenaire?category=partenaire"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-bold text-[#1F2240] transition hover:bg-slate-50"
          >
            🤝 {t('Devenir partenaire', 'Become a partner')}
          </a>
        </div>
      </div>
    </main>
  );
}
