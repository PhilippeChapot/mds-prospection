/**
 * Sellsy V2 API client — minimal fetch-based.
 *
 * OAuth 2.0 client_credentials flow :
 *   1. POST /v2/oauth2/access-tokens avec { grant_type, client_id, client_secret, scope }
 *   2. Token retourne (TTL 24h).
 *   3. On cache le token en memoire (singleton) avec marge 1h sur l'expiration.
 *
 * Usage :
 *   const items = await sellsyFetch<{ data: Item[] }>('/items/search', {
 *     method: 'POST',
 *     body: JSON.stringify({ filter: { reference: { like: 'MDS-' } } }),
 *   });
 *
 * Doc API : https://api.sellsy.com/doc/v2
 *
 * Logs structures (prefix [sellsy/client] pour grep Vercel Logs) :
 *   [sellsy/client] token refresh expires_at=...
 *   [sellsy/client] fetch path=/items/search status=200 ms=...
 *   [sellsy/client] error path=... status=... msg=...
 */

const SELLSY_BASE = 'https://api.sellsy.com/v2';
const TOKEN_URL = 'https://login.sellsy.com/oauth2/access-tokens';
// Marge avant expiration : 1h sur les 24h Sellsy.
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

export class SellsyError extends Error {
  status: number;
  body: unknown;
  path: string;

  constructor(message: string, status: number, path: string, body: unknown) {
    super(message);
    this.name = 'SellsyError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SELLSY_CLIENT_ID;
  const clientSecret = process.env.SELLSY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SELLSY_CLIENT_ID and SELLSY_CLIENT_SECRET must be set in env.');
  }
  return { clientId, clientSecret };
}

/**
 * Recupere un access token, en cache pour la duree de vie - 1h de marge.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getCredentials();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'all',
    }),
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* noop */
    }
    throw new SellsyError(
      `Sellsy OAuth token fetch failed (${response.status})`,
      response.status,
      '/oauth2/access-tokens',
      body,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number; // seconds
  };

  const expiresAt = Date.now() + data.expires_in * 1000 - TOKEN_REFRESH_MARGIN_MS;
  cachedToken = { accessToken: data.access_token, expiresAt };

  console.log(
    '[sellsy/client] token refresh expires_at=%s (in_h=%d)',
    new Date(expiresAt).toISOString(),
    Math.round(data.expires_in / 3600),
  );

  return data.access_token;
}

export interface SellsyFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  headers?: Record<string, string>;
  /** Force le refresh du token avant l'appel (utile en cas de 401 detect cote retry). */
  forceTokenRefresh?: boolean;
}

/**
 * Wrapper fetch authentifie pour l'API Sellsy V2.
 *
 * Auto :
 *   - Authorization: Bearer <token> (refresh si expire)
 *   - content-type: application/json par defaut
 *   - Parse JSON, throw SellsyError typee si !ok
 *   - Logs structures (prefix [sellsy/client])
 */
export async function sellsyFetch<T = unknown>(
  path: string,
  options: SellsyFetchOptions = {},
): Promise<T> {
  if (options.forceTokenRefresh) {
    cachedToken = null;
  }

  const token = await getAccessToken();
  const url = `${SELLSY_BASE}${path}`;
  const start = Date.now();

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body,
  });

  const elapsedMs = Date.now() - start;

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    // Sellsy V2 retourne sur erreur 400 une structure imbriquee qu'il faut
    // serialiser EN ENTIER pour voir les details (le champ `error` contient
    // un objet { code, message, details: [...] }, pas une string). Sans
    // JSON.stringify, Node truncate les nested objects en "[Object]" et on
    // perd toute l'info utile.
    let bodySerialized: string;
    try {
      bodySerialized = JSON.stringify(body, null, 2);
    } catch {
      bodySerialized = String(body);
    }
    // Truncate pour eviter logs gigantesques (Sellsy peut envoyer des stack
    // traces verbeuses sur 500). 4KB est largement suffisant pour un payload
    // de validation 400.
    if (bodySerialized.length > 4000) {
      bodySerialized = bodySerialized.slice(0, 4000) + '\n... [truncated]';
    }

    console.error(
      '[sellsy/client] error path=%s status=%d ms=%d body=%s',
      path,
      response.status,
      elapsedMs,
      bodySerialized,
    );

    throw new SellsyError(
      `Sellsy fetch ${path} failed (${response.status})`,
      response.status,
      path,
      body,
    );
  }

  console.log('[sellsy/client] fetch path=%s status=%d ms=%d', path, response.status, elapsedMs);

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Util de tests : reset le cache token (utilise par vitest).
 */
export function _resetSellsyCacheForTests() {
  cachedToken = null;
}
