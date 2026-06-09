/**
 * P14.2.SalesCalendarGoogleSync — callback OAuth Google.
 *
 * Google redirige ici après consentement avec ?code & ?state. On :
 *   1. Vérifie le state (HMAC + fraîcheur) ET qu'il matche la session courante.
 *   2. Échange le code contre des tokens (refresh + email).
 *   3. Chiffre le refresh + upsert calendar_oauth_tokens.
 *   4. Enregistre le push channel (watch) + sync initiale incrémentale.
 *   5. Redirige vers /admin/calendar/settings?google=connected|error.
 *
 * Toujours rediriger (jamais d'écran blanc) : les erreurs partent en
 * ?google=error&reason=… pour affichage UI.
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { verifyOAuthState, exchangeCodeForTokens } from '@/lib/admin/calendar/google/oauth-client';
import { encryptToken } from '@/lib/admin/calendar/google/encryption';
import { upsertOAuthToken } from '@/lib/admin/calendar/google/tokens-store';
import { registerWebhook } from '@/lib/admin/calendar/google/webhook-manager';
import { syncEventsFromGoogle } from '@/lib/admin/calendar/google/pull-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SETTINGS_PATH = '/admin/calendar/settings';

function redirectTo(req: Request, query: string): NextResponse {
  const url = new URL(SETTINGS_PATH + query, req.url);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return redirectTo(req, `?google=error&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return redirectTo(req, '?google=error&reason=missing_params');
  }

  // Session courante (le redirect Google porte le cookie de session MDS).
  let userId: string;
  try {
    const profile = await requireAdminProfile();
    userId = profile.id;
  } catch {
    return redirectTo(req, '?google=error&reason=no_session');
  }

  // Vérif state (CSRF) + binding à l'user courant.
  const verified = verifyOAuthState(state, Date.now());
  if (!verified.ok || verified.userId !== userId) {
    return redirectTo(req, '?google=error&reason=bad_state');
  }

  // Échange code → tokens.
  let refreshToken: string | null;
  let email: string | null;
  try {
    const tokens = await exchangeCodeForTokens(code);
    refreshToken = tokens.refreshToken;
    email = tokens.email;
  } catch (err) {
    console.error(
      '[google/oauth-callback] exchange-failed user=%s msg=%s',
      userId,
      err instanceof Error ? err.message : String(err),
    );
    return redirectTo(req, '?google=error&reason=exchange_failed');
  }

  if (!refreshToken) {
    // Pas de refresh_token = consentement sans access_type=offline OU compte
    // déjà autorisé sans prompt=consent. On force le re-consentement.
    return redirectTo(req, '?google=error&reason=no_refresh_token');
  }

  // Chiffre + persiste.
  const upsert = await upsertOAuthToken({
    user_id: userId,
    encrypted_refresh_token: encryptToken(refreshToken),
    google_account_email: email,
  });
  if (!upsert.ok) {
    console.error('[google/oauth-callback] upsert-failed user=%s msg=%s', userId, upsert.error);
    return redirectTo(req, '?google=error&reason=store_failed');
  }

  // Enregistre le webhook + sync initiale (best-effort, ne bloque pas la
  // redirection de succès).
  try {
    await registerWebhook(userId);
    await syncEventsFromGoogle(userId);
  } catch (err) {
    console.warn(
      '[google/oauth-callback] post-connect-sync-failed user=%s msg=%s',
      userId,
      err instanceof Error ? err.message : String(err),
    );
  }

  return redirectTo(req, '?google=connected');
}
