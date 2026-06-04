/**
 * P5.x.MatchingFix (2026-06-04) — normalisation pays vers ISO 3166-1 alpha-2.
 *
 * Pourquoi : les imports event externes (P5.x.ExternalEvents) ont injecté
 * des `country='France'` (texte plein) en DB alors que les anciennes rows
 * utilisaient `country='FR'` (ISO). Convention figee = ISO 2 lettres.
 *
 * Pas de `'use server'` ici (export const + functions sync).
 */

const COUNTRY_ALIASES: Record<string, string> = {
  // FR
  FRANCE: 'FR',
  'FR.': 'FR',
  'REPUBLIQUE FRANCAISE': 'FR',
  // UK / GB
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  'ROYAUME-UNI': 'GB',
  'GREAT BRITAIN': 'GB',
  ENGLAND: 'GB',
  // BE
  BELGIUM: 'BE',
  BELGIQUE: 'BE',
  BELGIE: 'BE',
  // DE
  GERMANY: 'DE',
  ALLEMAGNE: 'DE',
  DEUTSCHLAND: 'DE',
  // NL
  NETHERLANDS: 'NL',
  'PAYS-BAS': 'NL',
  NEDERLAND: 'NL',
  HOLLAND: 'NL',
  // ES
  SPAIN: 'ES',
  ESPAGNE: 'ES',
  ESPANA: 'ES',
  // IT
  ITALY: 'IT',
  ITALIE: 'IT',
  ITALIA: 'IT',
  // CH
  SWITZERLAND: 'CH',
  SUISSE: 'CH',
  SCHWEIZ: 'CH',
  SVIZZERA: 'CH',
  // US
  'UNITED STATES': 'US',
  USA: 'US',
  'ETATS-UNIS': 'US',
  'UNITED STATES OF AMERICA': 'US',
  // CA
  CANADA: 'CA',
  // AT
  AUSTRIA: 'AT',
  AUTRICHE: 'AT',
  // SE
  SWEDEN: 'SE',
  SUEDE: 'SE',
  // DK
  DENMARK: 'DK',
  DANEMARK: 'DK',
  // NO
  NORWAY: 'NO',
  NORVEGE: 'NO',
  // FI
  FINLAND: 'FI',
  FINLANDE: 'FI',
  // PT
  PORTUGAL: 'PT',
  // IE
  IRELAND: 'IE',
  IRLANDE: 'IE',
  // PL
  POLAND: 'PL',
  POLOGNE: 'PL',
  // AU
  AUSTRALIA: 'AU',
  AUSTRALIE: 'AU',
  // BR
  BRAZIL: 'BR',
  BRESIL: 'BR',
  // CN
  CHINA: 'CN',
  CHINE: 'CN',
  // JP
  JAPAN: 'JP',
  JAPON: 'JP',
};

/**
 * Convertit n importe quelle representation pays vers ISO 3166-1 alpha-2.
 *
 * - "FR" → "FR" (deja ISO, juste upper-cased)
 * - "France" → "FR"
 * - "united kingdom" → "GB"
 * - "Belgique" → "BE"
 * - null/undefined/empty → null
 *
 * Fallback : si non reconnu mais 2 lettres, on retourne tel quel (upper).
 * Sinon on retourne null (mieux que stocker un text plein non-iso).
 */
export function normalizeCountryToIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Strip diacritics + upper for alias lookup.
  const key = trimmed.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  // Deja ISO (2 lettres) ?
  if (/^[A-Z]{2}$/.test(key)) return key;
  return null;
}
