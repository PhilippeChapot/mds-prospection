import { redirect } from 'next/navigation';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { isSuperAdmin } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Tokens MCP' };

export default async function McpTokensPage() {
  // P5.x.1-quater (bug #2) — defense in depth : Tokens MCP reserve aux
  // super_admin (admin et sales tapant l'URL en direct = redirect).
  const profile = await requireAdminProfile();
  if (!isSuperAdmin(profile.role)) {
    redirect('/admin?error=super_admin_only');
  }
  return (
    <ComingSoon
      title="Tokens MCP"
      phase="P5"
      description="Gestion des tokens pour Cowork / clients MCP externes — cf. SPEC §3.23."
    />
  );
}
