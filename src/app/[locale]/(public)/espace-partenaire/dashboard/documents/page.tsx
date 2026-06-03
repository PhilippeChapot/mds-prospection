import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { DocumentsSection } from '../_components/sections/DocumentsSection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes documents — Espace Partenaire' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function DocumentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadSectionData(locale as 'fr' | 'en');
  return <DocumentsSection data={data} locale={locale as 'fr' | 'en'} />;
}
