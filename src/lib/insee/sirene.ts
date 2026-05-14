/**
 * P5.x.23 — Client INSEE Sirene v3.11.
 *
 * Header confirmé via curl 2026-05-14 : `X-INSEE-Api-Key-Integration: <key>`.
 * Doc : https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=3.11&provider=insee
 *
 * Limites :
 *   - 30 req/min en accès public (largement suffisant pour notre usage admin).
 *   - 404 = aucun résultat, 400 = syntaxe invalide.
 *
 * Lucene escape : la requête `q=...` utilise la syntaxe Lucene. On échappe
 * tous les caractères réservés pour éviter les 400 sur les noms exotiques
 * (parenthèses, slashes, etc.).
 */

const BASE_URL = 'https://api.insee.fr/api-sirene/3.11';

const LOG_PREFIX = '[insee/sirene]';

// Caractères réservés par Lucene. Plus simple de les remplacer par espace
// que de les échapper individuellement (évite les bugs de double-échappement).
const LUCENE_RESERVED = /[+\-&|!(){}[\]^"~*?:\\/]/g;

export interface SireneAdresse {
  numeroVoieEtablissement: string | null;
  typeVoieEtablissement: string | null;
  libelleVoieEtablissement: string | null;
  codePostalEtablissement: string | null;
  libelleCommuneEtablissement: string | null;
}

export interface SireneEtablissement {
  siren: string;
  siret: string;
  etablissementSiege: boolean;
  etatAdministratifEtablissement: 'A' | 'F' | null; // A=Actif, F=Fermé
  uniteLegale: {
    denominationUniteLegale: string | null;
    activitePrincipaleUniteLegale: string | null;
    categorieJuridiqueUniteLegale: string | null;
  };
  adresseEtablissement: SireneAdresse;
}

export type AutoMatchResult =
  | {
      auto: true;
      ambiguous: false;
      siren: string;
      siret: string;
      etablissement: SireneEtablissement;
    }
  | { auto: false; ambiguous: true; candidates: SireneEtablissement[] }
  | null;

function getApiKey(): string {
  const k = process.env.INSEE_API_KEY;
  if (!k) throw new Error('INSEE_API_KEY missing');
  return k;
}

/**
 * Nettoie un nom pour Lucene : remove diacritics + remplace caractères
 * réservés par espace + collapse spaces.
 *
 * On ne wrap PAS de quotes — c'est plus permissif (Lucene fait du token-match).
 */
export function sanitizeForLucene(name: string): string {
  return name.replace(LUCENE_RESERVED, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Cherche dans INSEE Sirene par dénomination. Retourne au max `nombre`
 * établissements (sièges en priorité via tri).
 */
export async function searchSireneByName(
  name: string,
  options?: { codePostal?: string; nombre?: number },
): Promise<SireneEtablissement[]> {
  const nombre = options?.nombre ?? 5;
  const cleanName = sanitizeForLucene(name);
  if (!cleanName) return [];

  // Lucene tokens implicit AND. On boost les sièges via le tri.
  let q = `denominationUniteLegale:${cleanName}`;
  if (options?.codePostal) {
    q += ` AND codePostalEtablissement:${options.codePostal}`;
  }

  const url = `${BASE_URL}/siret?q=${encodeURIComponent(q)}&nombre=${nombre}&tri=etablissementSiege:desc`;

  const res = await fetch(url, {
    headers: {
      'X-INSEE-Api-Key-Integration': getApiKey(),
      accept: 'application/json',
    },
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('%s error status=%d body=%s', LOG_PREFIX, res.status, body.slice(0, 200));
    throw new Error(`INSEE Sirene API error: ${res.status}`);
  }

  const data = (await res.json()) as { etablissements?: SireneEtablissement[] };
  return data.etablissements ?? [];
}

/**
 * Stratégie auto-match :
 *   - 0 résultat → null
 *   - 1 résultat → auto, source = 'insee_auto'
 *   - >1 résultat avec 1 SEUL siège actif → auto siège
 *   - sinon → { ambiguous: true, candidates: [...] }
 *
 * Le caller décide quoi faire de l'ambiguous (alerte admin, dropdown UI).
 */
export async function autoMatchSiren(name: string, codePostal?: string): Promise<AutoMatchResult> {
  const results = await searchSireneByName(name, { codePostal, nombre: 5 });

  if (results.length === 0) return null;

  if (results.length === 1) {
    const r = results[0];
    return {
      auto: true,
      ambiguous: false,
      siren: r.siren,
      siret: r.siret,
      etablissement: r,
    };
  }

  const sieges = results.filter((r) => r.etablissementSiege);
  if (sieges.length === 1) {
    const r = sieges[0];
    return {
      auto: true,
      ambiguous: false,
      siren: r.siren,
      siret: r.siret,
      etablissement: r,
    };
  }

  return {
    auto: false,
    ambiguous: true,
    candidates: results,
  };
}

/**
 * Formatte une adresse INSEE en chaîne lisible (pour UI dropdown ambigu).
 */
export function formatSireneAddress(a: SireneAdresse): string {
  const parts: string[] = [];
  if (a.numeroVoieEtablissement) parts.push(a.numeroVoieEtablissement);
  if (a.typeVoieEtablissement) parts.push(a.typeVoieEtablissement);
  if (a.libelleVoieEtablissement) parts.push(a.libelleVoieEtablissement);
  const left = parts.join(' ').trim();
  const right = [a.codePostalEtablissement, a.libelleCommuneEtablissement]
    .filter(Boolean)
    .join(' ');
  return [left, right].filter(Boolean).join(', ');
}
