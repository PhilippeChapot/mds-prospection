/**
 * P15.1.VisitorModel — pays « low-risk » visa.
 *
 * Déclaré dès maintenant (utilisé pleinement par le workflow d'approbation
 * lettre invitation en P15.4). Un ressortissant d'un pays low-risk peut être
 * auto-approuvé ; les autres passent en validation manuelle.
 *
 * Codes ISO 3166-1 alpha-2.
 */
export const VISA_LOW_RISK_COUNTRIES = new Set<string>([
  // UE 27
  'FR',
  'DE',
  'IT',
  'ES',
  'NL',
  'BE',
  'LU',
  'PT',
  'AT',
  'DK',
  'SE',
  'FI',
  'IE',
  'GR',
  'PL',
  'CZ',
  'SK',
  'HU',
  'SI',
  'HR',
  'RO',
  'BG',
  'EE',
  'LV',
  'LT',
  'MT',
  'CY',
  // EFTA
  'CH',
  'NO',
  'IS',
  'LI',
  // Anglo-Saxon
  'GB',
  'US',
  'CA',
  'AU',
  'NZ',
  // Asie développée
  'JP',
  'SG',
  'KR',
]);

/** Renvoie true si le pays (ISO2) est considéré low-risk pour le visa. */
export function isLowRiskCountry(iso2: string | null | undefined): boolean {
  if (!iso2) return false;
  return VISA_LOW_RISK_COUNTRIES.has(iso2.trim().toUpperCase());
}
