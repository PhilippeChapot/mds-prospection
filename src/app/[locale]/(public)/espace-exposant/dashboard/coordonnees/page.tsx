import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { CoordonneesSection } from '../_components/sections/CoordonneesSection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes coordonnées — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function CoordonneesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadSectionData(locale as 'fr' | 'en');
  return <CoordonneesSection data={data} locale={locale as 'fr' | 'en'} />;
}
