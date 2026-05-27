/**
 * P5.x.1-quater-bis (bug #3) — helpers de decision d'acces a un prospect
 * cote app admin.
 *
 * Contexte : RLS bloque les SELECT sur prospects pour un Sales non-owner.
 * On utilise donc le service-role client cote page detail pour LIRE le
 * prospect (bypass RLS), puis on decide manuellement avec ce helper si
 * on affiche la fiche complete ou <ProspectForbiddenPage>.
 *
 * Doctrine :
 *   - super_admin / admin : voient TOUS les prospects (supervision).
 *   - sales : voit uniquement les prospects dont owner_id == self.
 *   - sales avec owner_id == null (non assigne) : NON visible par defaut
 *     (V1 — pas de notion de "shared prospects"). A revoir en V2 si Phil
 *     souhaite l'inverser.
 */

import type { UserRole } from '@/lib/supabase/auth-helpers';

export interface ProspectAccessInput {
  /** Role du user courant. */
  userRole: UserRole;
  /** Id du user courant. */
  userId: string;
  /** owner_id du prospect (peut etre null si non assigne). */
  prospectOwnerId: string | null;
}

/**
 * Retourne true ssi le user courant peut voir la fiche detaillee du
 * prospect. Sinon, il faut afficher <ProspectForbiddenPage>.
 */
export function canViewProspectDetail(input: ProspectAccessInput): boolean {
  const { userRole, userId, prospectOwnerId } = input;
  if (userRole === 'super_admin' || userRole === 'admin') return true;
  // Sales : strict — il doit etre owner. owner_id null => pas d'acces.
  if (userRole === 'sales') return prospectOwnerId !== null && prospectOwnerId === userId;
  // Tout autre role inattendu (V1 ne devrait pas en arriver la grace au
  // layout (authenticated) qui rejette deja).
  return false;
}
