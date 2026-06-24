/**
 * P16.x.PreProgrammeTeaser — landing privée (URL avec token) du pré-programme
 * MDS × PRS. Layout dédié (hors groupe (public) → pas de footer site).
 * noindex/nofollow strict. Aucun intervenant ni horaire exposé.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { getPreProgrammeAction } from '@/lib/public/preprogramme/get-actions';
import { PREPROGRAMME_LABELS } from './_components/labels';
import { PreProgrammeHero } from './_components/PreProgrammeHero';
import { PreProgrammeKpiBand } from './_components/PreProgrammeKpiBand';
import { PreProgrammePolesRepartition } from './_components/PreProgrammePolesRepartition';
import { PreProgrammeTrackSection } from './_components/PreProgrammeTrackSection';
import { PreProgrammeFooterCta } from './_components/PreProgrammeFooterCta';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pré-programme — MediaDays Solutions × Paris Radio Show 2026',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ locale: Locale; token: string }>;
}

export default async function PreProgrammePage({ params }: PageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const loc = locale === 'en' ? 'en' : 'fr';
  const labels = PREPROGRAMME_LABELS[loc];

  const result = await getPreProgrammeAction(token, loc);
  // Token invalide OU aucune conférence publiée → 404 opaque (on ne révèle
  // pas la raison à un visiteur non autorisé).
  if (!result.ok) {
    notFound();
  }

  const { kpis, repartition, mds, prs } = result.data;

  return (
    <div className="min-h-screen bg-white">
      <PreProgrammeHero labels={labels} locale={loc} token={token} />
      <PreProgrammeKpiBand labels={labels} kpis={kpis} />
      <PreProgrammePolesRepartition labels={labels} repartition={repartition} />
      <PreProgrammeTrackSection
        variant="mds"
        title={labels.mdsTrack}
        tagline={labels.mdsTagline}
        conferences={mds}
        labels={labels}
      />
      <PreProgrammeTrackSection
        variant="prs"
        title={labels.prsTrack}
        tagline={labels.prsTagline}
        conferences={prs}
        labels={labels}
      />
      <PreProgrammeFooterCta labels={labels} />
    </div>
  );
}
