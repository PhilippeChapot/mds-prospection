/**
 * Layout shell Espace Affilie — P7.x.1.A
 *
 * Auth check rapide (cookie + JWT) sans toucher la DB, identique au pattern
 * espace-exposant (P5.x.17). Si KO -> redirect /affilie?error=...
 *
 * Le shell visuel (sidebar / topbar / burger mobile) sera ajoute en
 * P7.x.1.B. En foundation on rend juste un container minimal pour valider
 * que l'auth fonctionne end-to-end.
 */

import { requireAffilieSession } from '@/lib/affilie/session';

export const dynamic = 'force-dynamic';

export default async function AffilieDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAffilieSession();
  return <>{children}</>;
}
