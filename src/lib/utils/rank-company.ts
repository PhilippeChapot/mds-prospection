/**
 * P5.x.24 — scoring déterministe pour le ranking des sociétés dans les
 * comboboxes admin. Réutilisé après une query serveur (ilike+GIN trgm)
 * qui sélectionne le sous-ensemble candidat ; on score côté serveur ou
 * côté JS pour ordonner.
 *
 * Bug fixé : cmdk's fuzzy default mettait "ALGAM" → LAGARDERE en top.
 * Algorithme à 4 niveaux :
 *   100 — name OU name_normalized startsWith query
 *    50 — name OU name_normalized contains substring exact
 *    30 — primary_domain contains substring
 *    10 — fuzzy match (chars in order, not adjacent)
 * Tie-breaker : ordre alphabétique.
 */

export interface RankableCompany {
  id: string;
  name: string;
  name_normalized?: string | null;
  primary_domain?: string | null;
}

export interface RankedCompany<T extends RankableCompany> {
  item: T;
  score: number;
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (const c of haystack) {
    if (c === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return false;
}

export function scoreCompany(query: string, c: RankableCompany): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1; // pas de filtre → tous gagnent un point
  const name = c.name.toLowerCase();
  const norm = c.name_normalized?.toLowerCase() ?? name;
  const domain = c.primary_domain?.toLowerCase() ?? '';

  if (name.startsWith(q) || norm.startsWith(q)) return 100;
  if (name.includes(q) || norm.includes(q)) return 50;
  if (domain.includes(q)) return 30;
  if (fuzzyMatch(q, name) || fuzzyMatch(q, norm)) return 10;
  return 0;
}

/**
 * Trie une liste de sociétés selon le scoring + alphabétique en tie-breaker.
 * Retourne les items conservés (score > 0) avec leur score, ordonnés desc.
 */
export function rankCompanyMatches<T extends RankableCompany>(
  query: string,
  companies: T[],
  limit = 20,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...companies].sort((a, b) => a.name.localeCompare(b.name, 'fr')).slice(0, limit);
  }
  return companies
    .map((c) => ({ c, score: scoreCompany(q, c) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, 'fr'))
    .slice(0, limit)
    .map(({ c }) => c);
}
