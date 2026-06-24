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
 * Extrait un domaine (sans www) depuis une URL ou un domaine nu.
 * "https://www.x.com/about" → "x.com" ; "X.COM" → "x.com" ; vide/null → null.
 */
export function extractDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain) return null;
  const s = urlOrDomain.trim().toLowerCase();
  if (!s) return null;
  try {
    const withScheme = /^https?:\/\//.test(s) ? s : `https://${s}`;
    return new URL(withScheme).hostname.replace(/^www\./, '') || null;
  } catch {
    return s.replace(/^www\./, '').replace(/\/.*$/, '') || null;
  }
}

/** Index Map<domaine, rawCountry> depuis des lignes {url, country}. Premier gagne. */
export function buildDomainCountryIndex(
  rows: Array<{ url: string | null | undefined; country: string | null | undefined }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    const country = (row.country ?? '').trim();
    if (!country) continue;
    const domain = extractDomain(row.url);
    if (!domain) continue;
    if (!index.has(domain)) index.set(domain, country);
  }
  return index;
}

export type CountrySourceV2 =
  | 'prospection_v2_domain'
  | 'connectonair_domain'
  | 'prospection_v2_name'
  | 'connectonair_name';

export interface CountryMatchV2 {
  rawCountry: string;
  source: CountrySourceV2;
}

export interface CountryIndexes {
  prospectionByDomain: Map<string, string>;
  connectOnAirByDomain: Map<string, string>;
  prospectionByName: Map<string, string>;
  connectOnAirByName: Map<string, string>;
}

/**
 * Cascade : domaine (Prospection puis ConnectOnAir) → nom (idem). Le domaine est
 * bien plus fiable que le nom (variations "20 Minutes" / "20 Minutes SAS").
 */
export function matchCountryCascade(
  company: { name: string; domain: string | null | undefined },
  idx: CountryIndexes,
): CountryMatchV2 | null {
  const domain = extractDomain(company.domain);
  if (domain) {
    const p = idx.prospectionByDomain.get(domain);
    if (p) return { rawCountry: p, source: 'prospection_v2_domain' };
    const c = idx.connectOnAirByDomain.get(domain);
    if (c) return { rawCountry: c, source: 'connectonair_domain' };
  }
  const key = normalizeName(company.name);
  if (key.length >= 2) {
    const p = idx.prospectionByName.get(key);
    if (p) return { rawCountry: p, source: 'prospection_v2_name' };
    const c = idx.connectOnAirByName.get(key);
    if (c) return { rawCountry: c, source: 'connectonair_name' };
  }
  return null;
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
