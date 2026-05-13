import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { KitCommunicationSection } from '../_components/sections/KitCommunicationSection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kit communication — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function KitCommunicationPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadSectionData(locale as 'fr' | 'en');
  return <KitCommunicationSection data={data} locale={locale as 'fr' | 'en'} />;
}
