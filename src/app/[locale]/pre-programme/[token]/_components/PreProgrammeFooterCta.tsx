/**
 * P16.x.PreProgrammeTeaser — footer CTA (3 boutons). Server component
 * (liens uniquement, aucun handler).
 */

import type { PreProgrammeLabels } from './labels';

export function PreProgrammeFooterCta({ labels }: { labels: PreProgrammeLabels }) {
  return (
    <footer className="bg-[#0b1437] px-6 py-20 text-center text-white">
      <p className="text-sm text-white/50">{labels.teaserNote}</p>
      <h2 className="font-display mt-3 text-3xl font-extrabold sm:text-4xl">{labels.ctaTitle}</h2>
      <p className="mt-3 text-white/70">{labels.ctaSubtitle}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="https://mediadays.solutions"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[#E94E8A] px-7 py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          {labels.ctaPartner}
        </a>
        <a
          href="mailto:philippe@mediadays.solutions"
          className="rounded-full border border-white/30 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/10"
        >
          {labels.ctaContact}
        </a>
        <a
          href="https://mediadays.net"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-white/30 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/10"
        >
          {labels.ctaVisit}
        </a>
      </div>
    </footer>
  );
}
