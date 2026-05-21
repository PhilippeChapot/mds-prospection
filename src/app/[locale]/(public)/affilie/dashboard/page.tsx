/**
 * Racine /{locale}/affilie/dashboard — P7.x.1.B
 *
 * Redirige vers la section par defaut (Stats) qui sert de page d'accueil
 * avec les KPI live. Pattern identique au dashboard exposant.
 */

import { redirect } from 'next/navigation';
import type { Locale } from 'next-intl';
import { DEFAULT_AFFILIE_SECTION } from './_components/nav-items';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieDashboardRootPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}/affilie/dashboard/${DEFAULT_AFFILIE_SECTION}`);
}
