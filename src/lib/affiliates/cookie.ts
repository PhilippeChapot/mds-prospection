/**
 * Cookie tracking affilie — P5.x.7.
 *
 * Stocke le `token` de l'affilie referent dans un cookie 30 jours.
 * Pas HttpOnly volontairement : le client peut lire en JS pour
 * preserver la valeur lors d'une navigation cote SPA wizard. SameSite
 * Lax pour eviter le CSRF tout en permettant le retour depuis un email
 * partenaire.
 */

export const AFFILIATE_COOKIE = 'mds_affiliate_ref';
export const AFFILIATE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Construit la string Cookie a poser via `Set-Cookie`. On l'utilise
 * dans le route handler `/api/affiliates/click` (POST cote client) et
 * dans la layout server-side du wizard (qui lit ?ref= et set le cookie
 * via `cookies()`).
 */
export function buildAffiliateCookieValue(token: string): {
  name: string;
  value: string;
  maxAge: number;
} {
  return {
    name: AFFILIATE_COOKIE,
    value: token,
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Sanitize un token venant du QS. On accepte alphanum + _ + - + .
 * jusqu'a 64 chars (le schema 0009 ne contraint pas la forme du
 * `token` mais cote API on filtre pour eviter cookie injection).
 */
export function isValidAffiliateToken(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (raw.length === 0 || raw.length > 64) return false;
  return /^[A-Za-z0-9_.\-]+$/.test(raw);
}
