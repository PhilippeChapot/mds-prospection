/**
 * P5.x.RestoreCountryFromXlsx — matching nom de société → pays, contre les
 * index construits depuis les xlsx sources (Prospection_v2 + ConnectOnAir).
 * Module pur (testable). La lecture xlsx vit dans le script.
 */

/** Normalise un nom pour le matching (case + accents + non-alphanum retirés). */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export type CountrySource = 'prospection_v2' | 'connectonair';

export interface CountryMatch {
  /** Libellé pays brut (ex: "France") — à passer ensuite à normalizeCountryToIso. */
  rawCountry: string;
  source: CountrySource;
}

/**
 * Construit un index Map<normName, rawCountry> depuis des lignes ayant un ou
 * plusieurs champs nom (ex: raison_social/abrege/sigle) + un champ pays.
 * Premier gagne (on n'écrase pas une entrée déjà indexée).
 */
export function buildNameCountryIndex(
  rows: Array<{ names: Array<string | null | undefined>; country: string | null | undefined }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    const country = (row.country ?? '').trim();
    if (!country) continue;
    for (const raw of row.names) {
      const n = (raw ?? '').trim();
      if (!n) continue;
      const key = normalizeName(n);
      if (key.length < 2) continue;
      if (!index.has(key)) index.set(key, country);
    }
  }
  return index;
}

/**
 * Cherche le pays d'une société : priorité Prospection_v2 puis ConnectOnAir.
 * Renvoie le libellé brut + la source, ou null si aucun match.
 */
export function matchCountry(
  companyName: string,
  prospectionIndex: Map<string, string>,
  connectOnAirIndex: Map<string, string>,
): CountryMatch | null {
  const key = normalizeName(companyName);
  if (key.length < 2) return null;
  const p = prospectionIndex.get(key);
  if (p) return { rawCountry: p, source: 'prospection_v2' };
  const c = connectOnAirIndex.get(key);
  if (c) return { rawCountry: c, source: 'connectonair' };
  return null;
}
