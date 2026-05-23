/**
 * Fuzzy matching helpers — P7.x.1.F
 *
 * Reutilise la doctrine Smart Add P5.x.23 :
 *   - normalize_name : strip diacritics + lower + remove non-alphanum
 *   - score : similarity simple (sorensen-dice trigrams) entre name_normalized
 *   - threshold : 0.85 = match "exact" (auto-validate), 0.6-0.85 = match
 *     "approximatif" (suggestion admin), < 0.6 = pas de match
 *
 * Pure functions — pas de DB, testables a froid.
 */

/**
 * Normalise un nom pour comparaison fuzzy.
 * Ex: "L'Equipe Médias!" -> "lequipemedias"
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sorensen-Dice coefficient sur trigrammes (caracteres). Retourne 0-1.
 *
 * Plus tolerant que le Levenshtein pour les fautes de frappe ; plus rapide
 * que le Jaro-Winkler pour les strings courtes (typiques noms de societe).
 *
 * Stratégie identique à celle utilisée dans la migration `pg_trgm` Postgres
 * (cf. migration 0001) — on reste cohérent client/serveur.
 */
export function diceCoefficient(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const trigramsA = makeTrigrams(na);
  const trigramsB = makeTrigrams(nb);
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;
  let intersect = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersect += 1;
  }
  return (2 * intersect) / (trigramsA.size + trigramsB.size);
}

function makeTrigrams(s: string): Set<string> {
  if (s.length < 3) {
    // Pour les chaines tres courtes, on utilise des bigrammes pour eviter
    // un Set vide (sinon dice = 0 systematique).
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) bigrams.add(s.slice(i, i + 2));
    return bigrams;
  }
  const trigrams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.slice(i, i + 3));
  }
  return trigrams;
}

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
}

/**
 * Filtre + tri une liste par score de similarite descendant. Retourne
 * uniquement les items avec score >= threshold.
 */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  getName: (item: T) => string,
  threshold = 0.5,
): FuzzyMatchResult<T>[] {
  const ranked = items
    .map((item) => ({ item, score: diceCoefficient(query, getName(item)) }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
  return ranked;
}

/** Seuil au-dela duquel on considere le match "exact" (auto-validate). */
export const MATCH_EXACT_THRESHOLD = 0.85;
/** Seuil au-dela duquel on suggere a l'admin (suggestion). */
export const MATCH_SUGGEST_THRESHOLD = 0.6;
