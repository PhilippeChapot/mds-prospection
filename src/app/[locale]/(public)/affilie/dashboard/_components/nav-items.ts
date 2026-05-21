/**
 * P7.x.1.B — config navigation Espace Affilie.
 *
 * 5 sections cibles (3 livrees en B, 2 grisees en attendant la C) :
 *   - stats        : KPI cards live (clics / prospects / ventes / commissions)
 *   - tracking     : liens copiables avec UTM
 *   - paiements    : tableau commissions (due / paid)
 *   - kit-comm     : assets generes (P7.x.1.C — disabled en B)
 *   - profil       : edition IBAN/BIC/contact (P7.x.1.C — disabled en B)
 *
 * Source unique partagee sidebar desktop + drawer mobile, idem pattern
 * espace-exposant (P5.x.17).
 */

export interface AffilieNavItem {
  /** Cle pour t('espaceAffilie.nav.<key>'). */
  labelKey: string;
  emoji: string;
  segment: string;
  /** false = grisee, route absente (placeholder phase ulterieure). */
  enabled: boolean;
  /** Phase de livraison si disabled. */
  phase?: 'P7.x.1.C';
}

export const AFFILIE_NAV_ITEMS: readonly AffilieNavItem[] = [
  { labelKey: 'stats', emoji: '📊', segment: 'stats', enabled: true },
  { labelKey: 'tracking', emoji: '🔗', segment: 'tracking', enabled: true },
  { labelKey: 'paiements', emoji: '💰', segment: 'paiements', enabled: true },
  { labelKey: 'kitCommunication', emoji: '🎨', segment: 'kit-communication', enabled: true },
  { labelKey: 'profil', emoji: '👤', segment: 'profil', enabled: true },
] as const;

/** Section affichee par defaut quand on atterrit sur /affilie/dashboard. */
export const DEFAULT_AFFILIE_SECTION = 'stats';
