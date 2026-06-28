/**
 * P16.x.PreProgrammeTeaser — hero immersif (gradient bleu marine, logos
 * MDS × PRS blancs). Server component (aucun handler).
 */

import Link from 'next/link';
import type { PreProgrammeLabels } from './labels';

export function PreProgrammeHero({
  labels,
  locale,
  token,
}: {
  labels: PreProgrammeLabels;
  locale: 'fr' | 'en';
  token: string;
}) {
  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  return (
    <header className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1437] via-[#1F2240] to-[#294294] px-6 py-20 text-center text-white">
      {/* Switch FR/EN */}
      <Link
        href={`/${otherLocale}/pre-programme/${token}`}
        className="absolute top-5 right-6 rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-white/10"
      >
        {otherLocale.toUpperCase()}
      </Link>

      <div className="mb-8 flex items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/MDSLogo_final_blanc_ligne.svg"
          alt="MediaDays Solutions"
          className="h-12 w-auto"
        />
        <span className="text-2xl font-light text-white/50">×</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/PRS-LogoBlanc2026-email.png"
          alt="Paris Radio Show"
          className="h-12 w-auto"
        />
      </div>

      <p className="mb-3 text-xs font-bold tracking-[0.25em] text-[#E94E8A] uppercase">
        {labels.eyebrow}
      </p>
      <h1 className="font-display max-w-3xl text-4xl leading-tight font-extrabold sm:text-5xl">
        {labels.heroTitle}
      </h1>
      <p className="mt-5 max-w-2xl text-base text-white/75 sm:text-lg">{labels.heroSubtitle}</p>
      <p className="mt-8 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm text-white/80">
        {labels.datesLieux}
      </p>
    </header>
  );
}
