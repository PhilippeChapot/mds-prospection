/**
 * P5.x.Apollo — client Apollo.io v1.
 *
 * Free tier (95 crédits/mois) :
 *   - `/v1/organizations/enrich?domain=...` (1 crédit si trouvé, 0 sinon)
 *   - `/v1/usage_stats/credit_usage_stats` (lecture compteur, gratuit)
 *
 * Hors scope V1 : people enrichment + organizations/search (Basic 49$/mo).
 *
 * Clé API stockée dans `app_settings.apollo_api_key` (cf. migration 0060).
 * Lecture via lib/admin/preferences/get-setting (service-role, bypass RLS).
 *
 * Logs : passer par `lib/apollo/sync-logger.ts` pour tracer dans sync_logs
 * (target='apollo'). Best-effort, ne fait jamais échouer le flow métier.
 */

import { getSetting } from '@/lib/admin/preferences/get-setting';

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

export class ApolloError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApolloError';
    this.status = status;
    this.body = body;
  }
}

export interface ApolloOrganization {
  id: string;
  name?: string | null;
  website_url?: string | null;
  blog_url?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  facebook_url?: string | null;
  primary_phone?: { number?: string | null; sanitized_number?: string | null } | null;
  industry?: string | null;
  keywords?: string[] | null;
  estimated_num_employees?: number | null;
  organization_revenue?: number | null;
  founded_year?: number | null;
  short_description?: string | null;
  raw_address?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  owned_by_organization?: { id?: string; name?: string | null } | null;
  // ... le payload est conservé en entier via apollo_raw_data.
  [key: string]: unknown;
}

export interface ApolloCreditUsage {
  used: number;
  granted: number;
  remaining: number;
  period_end?: string | null;
}

export async function getApolloApiKey(): Promise<string | null> {
  const raw = await getSetting<string>('apollo_api_key', '');
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return raw.trim();
}

export async function isApolloEnabled(): Promise<boolean> {
  const enabled = (await getSetting<boolean>('apollo_enabled', false)) === true;
  if (!enabled) return false;
  const key = await getApolloApiKey();
  return !!key;
}

/**
 * GET /v1/organizations/enrich?domain=...
 *
 * Retourne null si Apollo dit "no match" (HTTP 200 mais `organization: null`).
 * Throw ApolloError sur HTTP error ou clé manquante.
 */
export async function apolloOrganizationEnrich(domain: string): Promise<ApolloOrganization | null> {
  const apiKey = await getApolloApiKey();
  if (!apiKey) {
    throw new ApolloError(
      'Apollo non configuré : ajoutez `apollo_api_key` dans Préférences > Intégrations.',
      0,
      null,
    );
  }

  const url = new URL(`${APOLLO_API_BASE}/organizations/enrich`);
  url.searchParams.set('domain', domain.trim().toLowerCase());

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
      accept: 'application/json',
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg =
      (body as { error_message?: string } | null)?.error_message ?? `Apollo HTTP ${res.status}`;
    throw new ApolloError(`Apollo /organizations/enrich failed: ${msg}`, res.status, body);
  }

  const org = (body as { organization?: ApolloOrganization | null } | null)?.organization;
  return org ?? null;
}

/**
 * GET /v1/usage_stats/credit_usage_stats — gratuit (ne consomme pas).
 * Renvoie le compteur (used/granted/remaining) pour afficher le badge UI.
 */
export async function apolloGetCreditUsage(): Promise<ApolloCreditUsage | null> {
  const apiKey = await getApolloApiKey();
  if (!apiKey) return null;

  const res = await fetch(`${APOLLO_API_BASE}/usage_stats/credit_usage_stats`, {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
  });

  if (!res.ok) return null;
  try {
    const body = (await res.json()) as {
      credit_usage_stats?: {
        used?: number;
        granted?: number;
        period_end?: string | null;
      };
    };
    const s = body.credit_usage_stats;
    if (!s || typeof s.used !== 'number' || typeof s.granted !== 'number') return null;
    return {
      used: s.used,
      granted: s.granted,
      remaining: Math.max(0, s.granted - s.used),
      period_end: s.period_end ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Helper : détermine si la query ressemble à un domaine (regex simple).
 * V1 Free tier : pas de recherche par nom — on bloque côté action.
 */
export function isLikelyDomain(query: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(query.trim());
}
