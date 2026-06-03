/**
 * P5.x.17 — config navigation Espace Contact V1.3.
 * P9.2     — ajout 'messages' (messagerie interne).
 * P8.2     — menu dynamique selon profil contact (visibleFor).
 *
 * Source unique partagee entre sidebar desktop et drawer mobile.
 * Le `match` est un sous-chemin teste contre `pathname` (sans locale).
 *
 * `visibleFor(profile)` decide si l'item s'affiche pour le contact
 * connecte. Un contact simple (presse, etc.) ne voit que les sections
 * always-on (profil, preferences, messages, ressources).
 */

import type { ContactProfile } from '@/lib/espace-partenaire/detect-profile';

export interface PartenaireNavItem {
  /** Cle pour t('espacePartenaire.nav.<key>'). */
  labelKey: string;
  /** Emoji affiche a gauche du label. */
  emoji: string;
  /** Sous-chemin (sans /[locale]/espace-partenaire/dashboard/). */
  segment: string;
  /** P8.2 : predicat de visibilite. Null = toujours visible. */
  visibleFor?: (profile: ContactProfile | null) => boolean;
}

const isExpoOrLead = (p: ContactProfile | null) => Boolean(p?.is_partenaire || p?.is_lead);
const isExpoOnly = (p: ContactProfile | null) => Boolean(p?.is_partenaire);

export const EXPOSANT_NAV_ITEMS: readonly PartenaireNavItem[] = [
  // P8.2 — sections always-on pour tout contact connecte.
  { labelKey: 'profil', emoji: '👤', segment: 'profil' },
  { labelKey: 'preferencesEmail', emoji: '📧', segment: 'preferences-email' },
  // Sections partenaire/lead.
  { labelKey: 'stand', emoji: '📍', segment: 'stand', visibleFor: isExpoOnly },
  { labelKey: 'coordonnees', emoji: '📞', segment: 'coordonnees', visibleFor: isExpoOrLead },
  { labelKey: 'documents', emoji: '📄', segment: 'documents', visibleFor: isExpoOnly },
  {
    labelKey: 'kitCommunication',
    emoji: '🎨',
    segment: 'kit-communication',
    visibleFor: isExpoOnly,
  },
  { labelKey: 'invitations', emoji: '📨', segment: 'invitations', visibleFor: isExpoOnly },
  // P6.x.1b — commande complémentaire (signed_at requis cote page).
  { labelKey: 'commander', emoji: '🛒', segment: 'commander', visibleFor: isExpoOnly },
  // P6.x.1b-β — historique commandes complémentaires.
  { labelKey: 'commandes', emoji: '🧾', segment: 'commandes', visibleFor: isExpoOnly },
  // P3.1 — ressources markdown bilingues (toujours visible).
  { labelKey: 'ressources', emoji: '📚', segment: 'ressources' },
  // P9.2 — messagerie interne (toujours visible).
  { labelKey: 'messages', emoji: '💬', segment: 'messages' },
] as const;

/**
 * Slug par defaut quand l'utilisateur atterrit sur /espace-partenaire/dashboard.
 * - Partenaires : 'stand' (comportement legacy).
 * - Contacts simples : 'profil'.
 */
export const DEFAULT_EXPOSANT_SECTION = 'stand';

export function filterNavItemsForProfile(
  items: readonly PartenaireNavItem[],
  profile: ContactProfile | null,
): PartenaireNavItem[] {
  return items.filter((it) => !it.visibleFor || it.visibleFor(profile));
}
