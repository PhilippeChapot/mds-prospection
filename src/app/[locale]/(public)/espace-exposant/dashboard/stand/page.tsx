import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { StandSection } from '../_components/sections/StandSection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon stand — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function StandPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadSectionData(locale as 'fr' | 'en');
  return <StandSection data={data} locale={locale as 'fr' | 'en'} />;
}
