/**
 * P16.x.PreProgrammeInteractive — page détail conférence (privée, token).
 * noindex. 404 opaque si token invalide ou slug introuvable.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { getPreProgrammeAction } from '@/lib/public/preprogramme/get-actions';
import { findConferenceBySlug } from '@/lib/public/preprogramme/filter';
import { ConferenceDetailView } from './_components/ConferenceDetailView';
import { QuestionDrawer } from '../_components/QuestionDrawer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conférence — Pré-programme MediaDays Solutions × Paris Radio Show 2026',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ locale: Locale; token: string; slug: string }>;
}

export default async function ConferenceDetailPage({ params }: PageProps) {
  const { locale, token, slug } = await params;
  setRequestLocale(locale);
  const loc = locale === 'en' ? 'en' : 'fr';

  const result = await getPreProgrammeAction(token, loc);
  if (!result.ok) notFound();

  const all = [...result.data.mds, ...result.data.prs];
  const conference = findConferenceBySlug(all, slug);
  if (!conference) notFound();

  return (
    <>
      <ConferenceDetailView conference={conference} locale={loc} token={token} />
      <QuestionDrawer locale={loc} />
    </>
  );
}
