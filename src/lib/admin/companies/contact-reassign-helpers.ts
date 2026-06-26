/**
 * P5.x.ReassignContactsToCompany — helpers purs (pas de 'use server', donc
 * importables aussi bien côté server action que côté composant client pour
 * calculer le warning « domaine email incohérent » avant confirmation).
 */

/**
 * Domaines email « perso » : un contact avec une adresse perso n'est pas
 * censé matcher le domaine d'une société → on n'affiche jamais de warning
 * mismatch pour ces domaines (c'est normal/attendu).
 */
export const PERSONAL_EMAIL_DOMAINS = new Set<string>([
  'gmail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.fr',
  'live.com',
  'msn.com',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'sfr.fr',
  'bbox.fr',
  'laposte.net',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'gmx.fr',
  'gmx.com',
]);

/** Extrait le domaine (lowercase, trim) d'une adresse email, ou null. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim();
  return domain || null;
}

/**
 * Vrai si le domaine de l'email du contact ne correspond PAS au domaine de la
 * société cible. Renvoie false (= pas de warning) quand :
 *   - email vide / sans domaine
 *   - domaine cible vide
 *   - domaine email perso (gmail, etc.)
 *   - domaines identiques (insensible à la casse)
 */
export function detectDomainMismatch(
  contactEmail: string | null | undefined,
  targetDomain: string | null | undefined,
): boolean {
  const contactDomain = emailDomain(contactEmail);
  if (!contactDomain) return false;

  const target = targetDomain?.toLowerCase().trim();
  if (!target) return false;

  if (PERSONAL_EMAIL_DOMAINS.has(contactDomain)) return false;

  return contactDomain !== target;
}

export interface ReassignContactLite {
  id: string;
  email: string | null;
  name: string;
}

/**
 * Parmi les contacts sélectionnés, retourne ceux dont le domaine email ne
 * matche pas la société cible (utilisé pour afficher le warning + forcer la
 * confirmation côté modal, et re-validé côté server action).
 */
export function contactsWithDomainMismatch(
  contacts: ReassignContactLite[],
  targetDomain: string | null | undefined,
): ReassignContactLite[] {
  return contacts.filter((c) => detectDomainMismatch(c.email, targetDomain));
}
