/**
 * P6.x.2a — Page admin Emplacements (catalogue stands + assign drag-drop).
 *
 * Server component qui charge :
 *   - Tous les stands (groupés par salle)
 *   - KPIs (libre/réservé/payé/bloqué)
 *   - Prospects sans stand (sidebar drag source)
 *
 * Délègue le rendu interactif au composant client `<EmplacementsClient>`.
 */

import { redirect } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listStands, getStandKpis, listProspectsWithoutStand } from '@/lib/admin/stands/queries';
import { EmplacementsClient } from './_components/EmplacementsClient';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Emplacements' };
export const dynamic = 'force-dynamic';

export default async function EmplacementsPage() {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    redirect('/admin?error=emplacements_admin_only');
  }

  const [stands, kpis, prospects] = await Promise.all([
    listStands({}),
    getStandKpis(),
    listProspectsWithoutStand(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-md-blue-dark text-2xl font-extrabold">Emplacements</h1>
        <p className="text-md-text-muted text-sm">
          Catalogue des stands Salle Le Nôtre + autres salles. Drag-drop un prospect (panneau droit)
          sur un stand libre pour l’assigner.
        </p>
      </header>

      <EmplacementsClient initialStands={stands} initialKpis={kpis} initialProspects={prospects} />
    </div>
  );
}
