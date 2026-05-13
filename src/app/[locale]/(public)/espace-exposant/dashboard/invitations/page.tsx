import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { InvitationsSection } from '../_components/sections/InvitationsSection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes invitations — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function InvitationsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadSectionData(locale as 'fr' | 'en');
  return <InvitationsSection data={data} locale={locale as 'fr' | 'en'} />;
}
