/**
 * P5.x.MatchingFix — helpers PUR (sync, no I/O, no 'use server') pour le
 * script cleanup-company-duplicates.ts.
 *
 * Isolés dans ce fichier pour respecter la doctrine
 * [[feedback_pnpm_build_before_push_server_files]] (helpers reutilisables
 * = pas dans un fichier 'use server').
 *
 * Aussi reutilisable par d autres scripts/tests.
 */

import { normalizeCountryToIso } from '@/lib/format/country';

/** Normalise un nom company pour cluster key : UPPER + strip diacritics + trim. */
export function normalizeNameForCluster(name: string | null | undefined): string {
  if (!name) return '';
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

const CRITICAL_FIELDS = [
  'website',
  'primary_domain',
  'raw_address',
  'city',
  'postal_code',
  'phone',
  'linkedin_url',
  'sellsy_id',
  'description',
] as const;

/**
 * Score un row company sur sa completude critique : nb de champs critiques
 * remplis (non-null, non-empty). Le "keeper" d un cluster est la row avec
 * le score le plus haut.
 */
export function scoreCompletenessForCleanup(row: Record<string, unknown>): number {
  let s = 0;
  for (const f of CRITICAL_FIELDS) {
    const v = row[f];
    if (v != null && v !== '') s++;
  }
  return s;
}

/**
 * Union des external_event_tags de plusieurs rows : pour chaque event_key,
 * union des annees. Sort + dedup.
 */
export function mergeEventTagsForCleanup(
  keeperTags: Record<string, number[]> | null | undefined,
  otherTagsList: Array<Record<string, number[]> | null | undefined>,
): Record<string, number[]> {
  const merged: Record<string, number[]> = {};
  // Copie keeper.
  for (const [k, years] of Object.entries(keeperTags ?? {})) {
    if (Array.isArray(years) && years.length > 0) merged[k] = [...years];
  }
  // Union with others.
  for (const tags of otherTagsList) {
    if (!tags) continue;
    for (const [k, years] of Object.entries(tags)) {
      if (!Array.isArray(years)) continue;
      const set = new Set(merged[k] ?? []);
      for (const y of years) set.add(y);
      merged[k] = Array.from(set).sort((a, b) => a - b);
    }
  }
  return merged;
}

/**
 * Sélectionne le meilleur pays parmi plusieurs candidats :
 *   1. Pref ISO 2 lettres deja stocke.
 *   2. Fallback : normalizeCountryToIso() sur le 1er candidat non-null.
 */
export function pickBestCountryForCleanup(rows: Array<{ country: string | null }>): string | null {
  // 1) Pref ISO 2 lettres existant.
  for (const r of rows) {
    if (r.country && /^[A-Z]{2}$/.test(r.country)) return r.country;
  }
  // 2) Normalize n importe quel candidat non-null.
  for (const r of rows) {
    const iso = normalizeCountryToIso(r.country);
    if (iso) return iso;
  }
  return null;
}
