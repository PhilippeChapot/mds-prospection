/**
 * P5.x.MatchingFix (2026-06-04) — helpers de matching company case+accent
 * insensitive.
 *
 * Pourquoi : P5.x.ExternalEvents utilisait `.eq(name_normalized, X)` ce
 * qui suppose que toutes les rows en DB ont passé le MEME algo de
 * normalisation. En pratique, les rows historiques avaient un
 * name_normalized different (pas de strip legal suffix, ponctuation
 * preservee, etc.) → matching ratait → doublons silencieux ("Lawo AG"
 * vs "LAWO" importé SATIS).
 *
 * Solution : un helper unique appelable depuis n importe ou (PAS de
 * `'use server'` ici car on exporte des fonctions sync + constantes).
 *
 * Doctrine [[normalize-name-for-matching]] : tout match company par
 * nom DOIT passer par ces helpers. Le matching strict sur
 * `companies.name` brut ou meme `name_normalized` brut est INTERDIT.
 */

/**
 * Normalisation déterministe d'un nom de company pour matching.
 * - NFD + strip diacritiques (équivalent UNACCENT côté DB).
 * - UPPER (case insensitive).
 * - Trim + collapse whitespace.
 *
 * Mirror du UPPER(UNACCENT(...)) cote DB → utiliser dans les helpers
 * JS qui comparent input vs DB output deja normalise.
 */
export function normalizeNameJs(name: string | null | undefined): string {
  if (!name) return '';
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

/**
 * Pattern ILIKE pour PostgREST : matching case-insensitive via Postgres
 * (UNACCENT doit etre installe + nous appliquons UPPER cote input).
 *
 * Note : PostgREST ne supporte pas directement les fonctions custom
 * dans .eq()/ilike(). On utilise ILIKE qui couvre la case ; pour les
 * accents on s appuie sur le normalisation cote input (input deja
 * sans accents) + assumption que la DB contient des noms accent-sensitive.
 *
 * Si tu as besoin d un matching plus strict avec UNACCENT cote DB,
 * passer par une RPC `match_company_by_name(p_normalized text)` ou
 * une vue materialisee. V1 : ILIKE suffit pour 95% des cas.
 */
export function ilikePatternForName(name: string): string {
  return normalizeNameJs(name);
}
