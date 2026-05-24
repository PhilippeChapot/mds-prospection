/**
 * Page admin /admin/affiliate-claims — P7.x.1.F
 *
 * Liste les claims par tab (Pending / Active / Rejected). Pour chaque
 * pending, actions Valider / Rejeter. Pour les actives, suppression
 * reservee super_admin (bouton conditionnel cote UI).
 */

import { redirect } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listClaimsForAdmin } from '@/lib/affiliate-claims/queries';
import { AdminClaimsClient } from './AdminClaimsClient';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Claims affiliés' };

export default async function AffiliateClaimsAdminPage() {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'super_admin') {
    redirect('/admin?error=affiliate_claims_admin_only');
  }

  const [pending, active, rejected] = await Promise.all([
    listClaimsForAdmin('pending'),
    listClaimsForAdmin('active'),
    listClaimsForAdmin('rejected'),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Claims affiliés
        </h1>
        <p className="text-md-text-muted text-sm">
          Validation des attributions société↔affilié. Les claims déclarés par les affiliés (👤)
          demandent une validation manuelle anti-fraude.
        </p>
      </header>

      <AdminClaimsClient
        pending={pending}
        active={active}
        rejected={rejected}
        currentRole={profile.role}
      />
    </div>
  );
}
