import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Garde auth + role pour TOUTES les routes /admin/** SAUF /admin/login.
 * Le route group `(authenticated)` n'apparait pas dans l'URL.
 *
 * - Pas de session     -> /admin/login (deja gere par le proxy, mais double belt and braces ici)
 * - role NOT IN (admin,sales) -> signOut + /admin/login?error=unauthorized
 *
 * Le shell visuel (sidebar + topbar) sera ajoute en M2 — ici on rend juste les enfants.
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

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile || (profile.role !== 'admin' && profile.role !== 'sales')) {
    await supabase.auth.signOut();
    redirect('/admin/login?error=unauthorized');
  }

  return <>{children}</>;
}
