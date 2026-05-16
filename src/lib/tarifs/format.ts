/**
 * P6.x.1a-ter — formatage des prix HT pour /admin/tarifs et UI consommatrices.
 *
 * Format cible : "1 234,56 € HT" (séparateur milliers FR espace classique +
 * virgule décimale). Défensif : accepte `number | string | null | undefined`.
 * Si parseFloat → NaN, on retourne le placeholder.
 *
 * Pourquoi accepter string : Supabase REST encode numeric(12,2) comme string
 * dans certains chemins, et l'interface DB types n'est pas toujours respectée
 * à 100% côté runtime.
 *
 * Pourquoi normaliser les espaces : toLocaleString('fr-FR') produit des
 * espaces insécables (NBSP   + narrow NBSP   en grouping selon
 * version ICU). On normalise en espace classique pour faciliter
 * copier-coller + tests déterministes.
 */

const PLACEHOLDER = '—';
// Inclut tabs, NBSP ( ), narrow NBSP ( ), thin space ( ).
const WHITESPACE_VARIANTS = /[\s   ]/g;

export function formatEurHt(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return PLACEHOLDER;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return PLACEHOLDER;
  const formatted = num
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(WHITESPACE_VARIANTS, ' ');
  return `${formatted} € HT`;
}
