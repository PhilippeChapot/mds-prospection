/**
 * Helpers pour les checks de role — P7.x.1.F-ter
 *
 * Contexte : en P7.x.1.F on a ajoute le role 'super_admin' a l'enum
 * user_role (`'admin' | 'sales' | 'super_admin'`). De nombreux checks
 * historiques utilisent `role === 'admin'` strictement, ce qui bloque
 * un super_admin (cf. layout admin qui signOut en chaine).
 *
 * Doctrine :
 *   - `super_admin` est `admin++` : il a tous les droits admin + un
 *     surensemble (actions destructives type DELETE affiliate_claim).
 *   - `sales` reste strictement separe (perspective owner_id, etc.).
 *
 * Usage :
 *   - `hasAdminAccess(role)` remplace `role === 'admin'` partout ou
 *     l'intention est "admin OU super_admin" (= toutes les actions
 *     admin generiques).
 *   - `requireSuperAdmin()` (existe deja dans auth-helpers.ts) reste
 *     reserve aux actions super_admin only (DELETE affiliate_claim
 *     actif, etc.).
 *   - `isSalesOnly` pour les checks specifiques sales (owner_id forced,
 *     visibilite limitee).
 */

import type { UserRole } from '@/lib/supabase/auth-helpers';

/** Roles qui ont acces aux pages admin (layout, fonctionnalites standard). */
export const ADMIN_ROLES: readonly UserRole[] = ['admin', 'super_admin'] as const;

/** Helper de check : true pour admin OU super_admin, false pour sales. */
export function hasAdminAccess(role: string | null | undefined): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** Helper de check : true UNIQUEMENT pour super_admin (actions destructives). */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin';
}

/** Helper de check : true UNIQUEMENT pour sales (owner_id forced). */
export function isSalesOnly(role: string | null | undefined): boolean {
  return role === 'sales';
}
