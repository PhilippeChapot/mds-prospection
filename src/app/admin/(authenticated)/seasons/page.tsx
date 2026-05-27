import { redirect } from 'next/navigation';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Saisons' };

export default async function SeasonsPage() {
  // P5.x.1-quater (bug #2) — defense in depth : admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  return (
    <ComingSoon
      title="Saisons"
      phase="P5"
      description="Gestion des editions du salon (creer, archiver, dupliquer) — cf. SPEC §3.15."
    />
  );
}
