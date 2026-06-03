import { redirect } from 'next/navigation';
import type { Locale } from 'next-intl';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { detectUserProfile } from '@/lib/espace-partenaire/detect-profile';
import { DEFAULT_EXPOSANT_SECTION } from './_components/nav-items';

/**
 * P5.x.17 / P8.2 — racine /espace-partenaire/dashboard.
 *
 * Dispatch intelligent selon profil contact :
 *   - partenaire / lead : redirect vers la section legacy (stand) — c'est
 *     l'accueil historique avec synthese booth + devis + payment.
 *   - contact simple  : redirect vers /profil (always-on, sinon le menu
 *     est vide et l'utilisateur est perdu).
 *
 * IMPORTANT (fix P8.2-redirect-loop) : ce fichier utilise
 * `requireContactSession` (sans fallback redirect vers /dashboard) et
 * surtout PAS `requireEspacePartenaireSession` qui, lui, redirige vers
 * /dashboard/profil quand il n'y a pas de prospect — ce qui ferait
 * une boucle si on l'utilisait ici.
 */

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function EspacePartenaireDashboardRootPage({ params }: PageProps) {
  const { locale } = await params;

  const session = await requireContactSession(locale);
  const profile = await detectUserProfile(session.contactId);

  const targetSection =
    profile?.is_partenaire || profile?.is_lead ? DEFAULT_EXPOSANT_SECTION : 'profil';
  redirect(`/${locale}/espace-partenaire/dashboard/${targetSection}`);
}
