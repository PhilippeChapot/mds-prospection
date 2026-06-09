/**
 * P14.2.SalesCalendarGoogleSync — client OAuth2 Google + Calendar.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module
 * (pas de 'use server'). Importable depuis server actions, routes, crons.
 *
 * Responsabilités :
 *   - Fabriquer un OAuth2Client googleapis depuis l'env.
 *   - Générer l'URL de consentement (scopes calendar + email).
 *   - Échanger un code contre des tokens (callback).
 *   - getAuthenticatedClientForUser : charge le refresh chiffré, le déchiffre,
 *     pose les credentials → googleapis auto-refresh l'access_token à la
 *     demande. Retourne un client `calendar_v3` prêt à l'emploi.
 */

import crypto from 'node:crypto';
import { google, type calendar_v3 } from 'googleapis';
import { decryptToken } from './encryption';
import { getOAuthToken } from './tokens-store';

/**
 * Type natif dérivé du constructeur googleapis — évite la dépendance directe
 * à google-auth-library (et le skew de versions hoistées par pnpm).
 */
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Scopes demandés :
 *   - calendar          : lister les calendriers (dropdown) + watch() webhook.
 *   - calendar.events   : CRUD events + conferenceData (Meet).
 *   - userinfo.email    : récupérer l'email du compte connecté (affichage UI).
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export function getOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Config OAuth Google incomplète (GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI).',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * State CSRF : "userId.timestamp.hmac" signé HMAC-SHA256 avec la clé OAuth.
 * Le callback re-vérifie la signature + la fraîcheur (< 15 min) ET que
 * l'userId matche la session courante (double-check dans la route).
 */
function stateSecret(): string {
  const secret = process.env.CALENDAR_OAUTH_ENCRYPTION_KEY;
  if (!secret) throw new Error('CALENDAR_OAUTH_ENCRYPTION_KEY manquante (state OAuth).');
  return secret;
}

export function signOAuthState(userId: string, nowMs: number): string {
  const payload = `${userId}.${nowMs}`;
  const hmac = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export function verifyOAuthState(
  state: string,
  nowMs: number,
): { ok: true; userId: string } | { ok: false } {
  const parts = state.split('.');
  if (parts.length !== 3) return { ok: false };
  const [userId, tsStr, hmac] = parts;
  const expected = crypto
    .createHmac('sha256', stateSecret())
    .update(`${userId}.${tsStr}`)
    .digest('hex');
  const a = Buffer.from(hmac, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || nowMs - ts > STATE_MAX_AGE_MS) return { ok: false };
  return { ok: true, userId };
}

/** Fabrique un OAuth2Client neuf (sans credentials). */
export function createOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getOAuthEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * URL de consentement Google. `state` transporte le user_id signé (CSRF +
 * binding du callback à l'user courant). access_type=offline + prompt=consent
 * garantissent un refresh_token (Google ne le renvoie qu'au 1er consentement
 * sinon — prompt=consent force le renvoi à chaque fois).
 */
export function buildConsentUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
    include_granted_scopes: true,
  });
}

export interface ExchangedTokens {
  refreshToken: string | null;
  accessToken: string | null;
  email: string | null;
}

/**
 * Échange le code OAuth contre des tokens + extrait l'email du compte via
 * l'id_token (JWT signé par Google, reçu directement sur TLS → décodage du
 * payload sans re-vérification de signature acceptable ici).
 */
export async function exchangeCodeForTokens(code: string): Promise<ExchangedTokens> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  let email: string | null = null;
  if (tokens.id_token) {
    email = decodeIdTokenEmail(tokens.id_token);
  }
  return {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    email,
  };
}

/** Décode le payload d'un id_token JWT et extrait `email` (best-effort). */
function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const payloadB64 = idToken.split('.')[1];
    if (!payloadB64) return null;
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Construit un OAuth2Client authentifié pour un user (refresh chiffré en DB).
 * googleapis rafraîchit automatiquement l'access_token via le refresh_token
 * quand il appelle l'API. Retourne null si l'user n'est pas connecté.
 */
export async function getAuthenticatedClientForUser(
  userId: string,
): Promise<{ auth: OAuth2Client; calendarId: string } | null> {
  const token = await getOAuthToken(userId);
  if (!token) return null;
  const refreshToken = decryptToken(token.encrypted_refresh_token);
  const auth = createOAuth2Client();
  auth.setCredentials({ refresh_token: refreshToken });
  return { auth, calendarId: token.google_calendar_id };
}

/** Helper : client calendar_v3 depuis un OAuth2Client authentifié. */
export function calendarClient(auth: OAuth2Client): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth });
}

/**
 * Révoque le refresh token côté Google (déconnexion propre). Best-effort :
 * une révocation échouée ne doit pas bloquer le cleanup DB local.
 */
export async function revokeToken(refreshToken: string): Promise<void> {
  const client = createOAuth2Client();
  try {
    await client.revokeToken(refreshToken);
  } catch (err) {
    console.warn(
      '[google/oauth-client] revoke-failed msg=%s',
      err instanceof Error ? err.message : String(err),
    );
  }
}
