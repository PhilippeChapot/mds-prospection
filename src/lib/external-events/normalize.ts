/**
 * P5.x.ExternalEvents — normalisation noms / domaines / années.
 *
 * normalizeCompanyName : accents -> ASCII, lowercase, strip suffixes
 *   juridiques courants (SAS, SARL, SA, etc.), suppression ponctuation,
 *   espaces multiples -> 1. C est la clef de matching strict pour
 *   eviter "Canal+ SAS" != "canal+".
 *
 * normalizeDomain : lowercase + strip protocole + strip www + strip
 *   chemin/query, retour du domaine racine uniquement.
 *
 * parseYearsFromCell : extrait toutes les annees [2020-2030] d une
 *   cellule libre (ex "2023, 2024 et 2025" -> [2023, 2024, 2025]).
 */

const LEGAL_SUFFIXES = [
  'sasu',
  'sas',
  'sarl',
  'sa',
  'sci',
  'eurl',
  'snc',
  'sci',
  'sca',
  'scs',
  'gmbh',
  'ltd',
  'limited',
  'llc',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'ag',
  'spa',
  'srl',
  'bv',
  'nv',
];

export function normalizeCompanyName(input: string): string {
  if (!input) return '';
  let s = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacritics
    .toLowerCase()
    .trim();

  // Strip surrounding quotes / parens
  s = s.replace(/^["'(]+|["')]+$/g, '').trim();

  // Replace separators by space
  s = s.replace(/[._\-/]+/g, ' ');

  // Remove punctuation except & and +
  s = s.replace(/[^a-z0-9&+ ]/g, ' ');

  // Strip legal suffixes (token-based, at end only)
  const tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.includes(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  s = tokens.join(' ');

  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.toLowerCase().trim();
  if (!s) return null;
  // Strip protocol
  s = s.replace(/^https?:\/\//, '');
  // Strip www
  s = s.replace(/^www\./, '');
  // Cut at first / ? #
  s = s.split(/[/?#]/)[0];
  // Strip trailing dot
  s = s.replace(/\.$/, '');
  if (!s.includes('.')) return null;
  return s;
}

/**
 * Extrait toutes les annees [minYear..maxYear] presentes dans une
 * cellule de type "MEDIADAYS 2023, 2024 et 2026". Retourne un tableau
 * dedupliqué et trié.
 */
export function parseYearsFromCell(
  input: string | null | undefined,
  options?: { minYear?: number; maxYear?: number },
): number[] {
  if (!input) return [];
  const minYear = options?.minYear ?? 2015;
  const maxYear = options?.maxYear ?? 2035;
  const matches = String(input).match(/\b(20\d{2})\b/g);
  if (!matches) return [];
  const years = matches.map((m) => parseInt(m, 10)).filter((y) => y >= minYear && y <= maxYear);
  return Array.from(new Set(years)).sort((a, b) => a - b);
}

/**
 * Levenshtein distance entre 2 chaines normalisees. Utilise par la UI
 * review pour suggerer des matches de companies (similarite > 0.7).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
