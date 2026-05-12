/**
 * Dates evenement MDS 2026 — factorisees pour social assets.
 *
 * Format affichage : "Ville · jour mois" (FR) ou "City · Month day" (EN).
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png.
 *
 * NOTE: si les dates evenement changent, modifier ici une seule fois.
 */

export const EVENT_DATES = {
  PARIS_FR: 'Paris · 15 décembre',
  MARSEILLE_FR: 'Marseille · 10 décembre',
  PARIS_EN: 'Paris · December 15',
  MARSEILLE_EN: 'Marseille · December 10',
} as const;

export function getEventDates(locale: 'fr' | 'en' = 'fr') {
  return locale === 'en'
    ? { paris: EVENT_DATES.PARIS_EN, marseille: EVENT_DATES.MARSEILLE_EN }
    : { paris: EVENT_DATES.PARIS_FR, marseille: EVENT_DATES.MARSEILLE_FR };
}
