/**
 * P5.x.17 — config navigation Espace Exposant V1.3 (5 sections).
 *
 * Source unique partagee entre sidebar desktop et drawer mobile.
 * Le `match` est un sous-chemin teste contre `pathname` (sans locale)
 * pour determiner l'item actif. Cleaner que `endsWith(href)` car evite
 * les faux positifs si on ajoute des sous-routes futures.
 */

export interface ExposantNavItem {
  /** Cle pour t('espaceExposant.nav.<key>'). */
  labelKey: string;
  /** Emoji affiche a gauche du label. */
  emoji: string;
  /** Sous-chemin (sans /[locale]/espace-exposant/dashboard/). */
  segment: string;
}

export const EXPOSANT_NAV_ITEMS: readonly ExposantNavItem[] = [
  { labelKey: 'stand', emoji: '📍', segment: 'stand' },
  { labelKey: 'coordonnees', emoji: '📞', segment: 'coordonnees' },
  { labelKey: 'documents', emoji: '📄', segment: 'documents' },
  { labelKey: 'kitCommunication', emoji: '🎨', segment: 'kit-communication' },
  { labelKey: 'invitations', emoji: '📨', segment: 'invitations' },
  // P6.x.1b — commande complémentaire. La page filtre par éligibilité
  // (signed_at non-null) et redirige avec banner explicative si non éligible.
  { labelKey: 'commander', emoji: '🛒', segment: 'commander' },
  // P6.x.1b-β — historique des commandes complémentaires.
  { labelKey: 'commandes', emoji: '🧾', segment: 'commandes' },
  // P3.1 — ressources markdown bilingues (guide, FAQ, charte graphique...).
  { labelKey: 'ressources', emoji: '📚', segment: 'ressources' },
] as const;

/**
 * Slug par defaut quand l'utilisateur atterrit sur /espace-exposant/dashboard.
 * Doit etre identique au segment d'un item de EXPOSANT_NAV_ITEMS.
 */
export const DEFAULT_EXPOSANT_SECTION = 'stand';
