/**
 * Service VIES (VAT Information Exchange System) — verification d'un
 * numero de TVA intracommunautaire UE.
 *
 * Endpoint SOAP officiel : https://ec.europa.eu/taxation_customs/vies/services/checkVatService
 *
 * Cache : table public.vat_verifications (P4 M1, migration 0022) avec
 * primary key (country, vat_number). TTL 30 jours cote app — au-dela, on
 * re-fetch VIES (les TVA peuvent etre revoquees).
 *
 * Note : VIES retourne 5xx tres souvent en heures de pointe — on tolere
 * un fail (return isValid=false sans cache) et on retentera plus tard
 * via le cron M5 ou la prochaine tentative manuelle.
 *
 * Logs structures (prefix [vies/verify]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';
const CACHE_TTL_DAYS = 30;
const LOG_PREFIX = '[vies/verify]';

/**
 * Liste des pays UE eligibles a l'autoliquidation (B2B intra-UE).
 * FR exclu (TVA 20% standard, pas d'autoliquidation B2B en France).
 */
export const EU_COUNTRIES_NON_FR = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const;

export type EuCountry = (typeof EU_COUNTRIES_NON_FR)[number];

export interface ViesResult {
  isValid: boolean;
  name?: string;
  address?: string;
  /** True si la valeur vient du cache, false si re-fetch VIES vient de
   *  finir. Utile pour les logs admin. */
  fromCache: boolean;
}

/**
 * Verifie un numero TVA UE et cache le resultat 30j.
 * Best-effort : si VIES est down, retourne { isValid: false, fromCache: false }
 * sans throw. L'admin peut retenter manuellement.
 */
export async function verifyVatNumber(country: string, vatNumber: string): Promise<ViesResult> {
  const normalizedCountry = country.toUpperCase().trim();
  const normalizedVat = vatNumber.replace(/\s/g, '').toUpperCase();

  console.log('%s start country=%s vat_number=%s', LOG_PREFIX, normalizedCountry, normalizedVat);

  // 1. Cache hit ?
  const cached = await readCache(normalizedCountry, normalizedVat);
  if (cached) {
    console.log('%s cache-hit country=%s valid=%s', LOG_PREFIX, normalizedCountry, cached.isValid);
    return { ...cached, fromCache: true };
  }

  // 2. Fetch VIES SOAP.
  let result: Omit<ViesResult, 'fromCache'> = { isValid: false };
  try {
    result = await fetchViesSoap(normalizedCountry, normalizedVat);
  } catch (err) {
    console.warn(
      '%s vies-fetch-failed country=%s msg=%s — return isValid=false',
      LOG_PREFIX,
      normalizedCountry,
      err instanceof Error ? err.message : String(err),
    );
    // Pas de cache write : on retentera la prochaine fois.
    return { isValid: false, fromCache: false };
  }

  // 3. UPSERT cache.
  await writeCache(normalizedCountry, normalizedVat, result);

  console.log(
    '%s done country=%s valid=%s name=%s',
    LOG_PREFIX,
    normalizedCountry,
    result.isValid,
    result.name ?? '—',
  );

  return { ...result, fromCache: false };
}

// ---------------------------------------------------------------------------
// Cache (read / write)
// ---------------------------------------------------------------------------

async function readCache(
  country: string,
  vatNumber: string,
): Promise<Omit<ViesResult, 'fromCache'> | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('vat_verifications')
    .select('is_valid, trader_name, trader_address, request_date')
    .eq('country', country)
    .eq('vat_number', vatNumber)
    .maybeSingle();

  if (!data) return null;

  // Verif TTL : si plus vieux que 30j, on re-fetch.
  const ageMs = Date.now() - new Date(data.request_date).getTime();
  if (ageMs > CACHE_TTL_DAYS * 24 * 3600 * 1000) {
    return null;
  }

  return {
    isValid: data.is_valid,
    name: data.trader_name ?? undefined,
    address: data.trader_address ?? undefined,
  };
}

async function writeCache(
  country: string,
  vatNumber: string,
  result: Omit<ViesResult, 'fromCache'>,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase.from('vat_verifications').upsert(
    {
      country,
      vat_number: vatNumber,
      is_valid: result.isValid,
      trader_name: result.name ?? null,
      trader_address: result.address ?? null,
      request_date: new Date().toISOString(),
    },
    { onConflict: 'country,vat_number' },
  );
}

// ---------------------------------------------------------------------------
// SOAP fetch + parsing
// ---------------------------------------------------------------------------

const SOAP_ENVELOPE = (country: string, vatNumber: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${country}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`.trim();

async function fetchViesSoap(
  country: string,
  vatNumber: string,
): Promise<Omit<ViesResult, 'fromCache'>> {
  const res = await fetch(VIES_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      soapaction: '',
    },
    body: SOAP_ENVELOPE(country, vatNumber),
    // VIES timeout occasionnels — on cap a 10s, retry plus tard via cache miss.
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`VIES http error ${res.status}`);
  }

  const xml = await res.text();
  return parseViesResponse(xml);
}

/**
 * Parse la response SOAP VIES (regex basique — assez robuste pour ce schema
 * stable). Exporte pour tests unitaires.
 *
 * Tolere les prefixes namespace XML (`ns2:valid`, `tns:name`, etc.) en plus
 * du tag nu — VIES utilise plusieurs prefixes selon les clients SOAP.
 */
export function parseViesResponse(xml: string): Omit<ViesResult, 'fromCache'> {
  const isValid = /<(?:[a-zA-Z0-9]+:)?valid>\s*true\s*<\/(?:[a-zA-Z0-9]+:)?valid>/i.test(xml);
  const name = matchTag(xml, 'name');
  const address = matchTag(xml, 'address');

  return {
    isValid,
    name: name && name !== '---' ? name : undefined,
    address: address && address !== '---' ? address : undefined,
  };
}

function matchTag(xml: string, tag: string): string | undefined {
  // Matche `<tag>` ou `<ns:tag>` peu importe le prefix de namespace.
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}>([^<]*)<\\/(?:[a-zA-Z0-9]+:)?${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
}

/**
 * True si le pays + TVA verifiee correspond a un cas d'autoliquidation
 * (UE non-FR + verified). Utile pour assembleRows cote create-document.
 */
export function isAutoliquidationApplicable(
  country: string | null | undefined,
  vatVerified: 'unverified' | 'pending' | 'valid' | 'invalid' | null,
): boolean {
  if (!country) return false;
  if (vatVerified !== 'valid') return false;
  const normalized = country.toUpperCase().trim() as EuCountry;
  return (EU_COUNTRIES_NON_FR as readonly string[]).includes(normalized);
}
