import { redirect } from 'next/navigation';
import type { Locale } from 'next-intl';
import { DEFAULT_EXPOSANT_SECTION } from './_components/nav-items';

/**
 * P5.x.17 — racine /espace-exposant/dashboard.
 *
 * Redirige vers la section par defaut (Mon stand) qui sert de page
 * d'accueil avec la synthese inscription + booth + devis + payment.
 *
 * V1.4 (futur) : une page recap "overview" pourrait remplacer ce
 * redirect avec des KPIs perso (stand attribue ?, devis signe ?,
 * X invites cliques ?).
 */

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function EspaceExposantDashboardRootPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}/espace-exposant/dashboard/${DEFAULT_EXPOSANT_SECTION}`);
}
