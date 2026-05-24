/**
 * Helpers d'auth cote serveur — recuperer l'utilisateur courant + son
 * profil applicatif (role) en une seule passe.
 *
 * Tous les server components et server actions doivent passer par ces
 * helpers plutot que d'appeler supabase.auth.getUser() directement, pour
 * garantir un comportement coherent vis-a-vis des redirects.
 */
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './server';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export type UserRole = 'admin' | 'sales' | 'super_admin';

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
};

/**
 * Renvoie le profil admin/sales/super_admin courant. Redirige vers
 * /admin/login si pas de session ou si role insuffisant. Le layout
 * (authenticated) garantit deja ces conditions, mais on revalide cote
 * action serveur pour pouvoir brancher des controles fins (ex : isAdmin
 * pour DELETE).
 *
 * Note : `super_admin` est considere comme admin + privilege etendu.
 * `requireAdminProfile` l'accepte ; pour les actions sensibles utiliser
 * `requireSuperAdmin` ci-dessous.
 */
export async function requireAdminProfile(): Promise<AdminProfile> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (
    !profile ||
    (!hasAdminAccess(profile.role) && profile.role !== 'sales' && profile.role !== 'super_admin')
  ) {
    redirect('/admin/login?error=unauthorized');
  }
  return profile as AdminProfile;
}

/**
 * P7.x.1.F — protege les actions destructives sensibles (DELETE d'un
 * affiliate_claim actif, etc.). Throw un Error si role != 'super_admin'
 * (les server actions catchent et renvoient un ActionResult ok:false).
 *
 * Promotion manuelle d'un user en super_admin via SQL Editor :
 *   UPDATE public.users SET role='super_admin' WHERE email='...';
 */
export async function requireSuperAdmin(): Promise<AdminProfile> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'super_admin') {
    throw new Error('Réservé aux super_admin.');
  }
  return profile;
}

/**
 * Recupere la saison active (is_active = true). Throw si aucune
 * (impossible normalement — la P0 seede MDS_2026 active).
 */
export async function getActiveSeasonId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) {
    throw new Error('Aucune saison active dans public.seasons (seed P0 manquant ?)');
  }
  return data.id;
}
