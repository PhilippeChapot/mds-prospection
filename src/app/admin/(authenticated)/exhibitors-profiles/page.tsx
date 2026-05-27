import { redirect } from 'next/navigation';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Profils partenaires' };

export default async function ExhibitorsProfilesPage() {
  // P5.x.1-quater (bug #2) — defense in depth : admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  return (
    <ComingSoon
      title="Profils partenaires"
      phase="P5"
      description="Vue de completude des profils + edition admin (cf. SPEC §3.14)."
    />
  );
}
