import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { SeasonProvider, type Season } from '@/components/admin/SeasonContext';

/**
 * Garde auth + role pour TOUTES les routes /admin/** SAUF /admin/login.
 * Le route group `(authenticated)` n'apparait pas dans l'URL.
 *
 * - Pas de session     -> /admin/login
 * - role NOT IN (admin,sales) -> signOut + /admin/login?error=unauthorized
 *
 * Monte aussi le shell visuel (Topbar + Sidebar) et le SeasonProvider.
 */
export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'sales')) {
    await supabase.auth.signOut();
    redirect('/admin/login?error=unauthorized');
  }

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, code, name_fr, is_active, status')
    .order('code', { ascending: false });

  const allSeasons = (seasons ?? []) as Season[];
  const activeSeason = allSeasons.find((s) => s.is_active) ?? allSeasons[0];

  if (!activeSeason) {
    throw new Error(
      'Aucune saison trouvee dans public.seasons — verifier le seed P0 (MDS_2026 attendue).',
    );
  }

  return (
    <SeasonProvider initialSeasons={allSeasons} initialActiveId={activeSeason.id}>
      <div className="flex min-h-svh flex-col">
        <AdminTopbar fullName={profile.full_name} email={profile.email} role={profile.role} />
        <div className="flex flex-1">
          {/* P6.x-mobile-burger : aside desktop, burger Sheet mobile (cf. AdminMobileMenu dans Topbar). */}
          <aside className="border-md-border bg-card hidden w-60 shrink-0 border-r md:flex">
            <AdminSidebar />
          </aside>
          <main className="bg-md-bg flex-1 overflow-x-auto px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </SeasonProvider>
  );
}
