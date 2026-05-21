/**
 * Layout shell Espace Affilie — P7.x.1.A / a-bis
 *
 * Auth check rapide (cookie + JWT) sans toucher la DB, identique au pattern
 * espace-exposant (P5.x.17). Si KO -> redirect /{locale}/affilie?error=...
 *
 * Le shell visuel (sidebar / topbar / burger mobile) sera ajoute en
 * P7.x.1.B. En foundation on rend juste un container minimal pour valider
 * que l'auth fonctionne end-to-end.
 */

import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';

export const dynamic = 'force-dynamic';

export default async function AffilieDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAffilieSession(locale);
  return <>{children}</>;
}
