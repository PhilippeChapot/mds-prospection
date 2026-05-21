/**
 * GET /api/affilie/login?token=... — P7.x.1.A
 *
 * Route Handler qui consomme le magic-link envoye par email :
 *   1. Lit ?token=...
 *   2. verifyAffilieMagicToken (TTL 15min, type=magic, scope=affilie)
 *   3. signAffilieSessionToken (TTL 8h, type=session)
 *   4. UPDATE affiliates.last_login_at (best-effort)
 *   5. NextResponse.redirect /affilie/dashboard avec cookie HttpOnly
 *      Secure SameSite=Lax pose sur la response.
 *
 * Erreurs (token absent/invalide/expire) -> redirect /affilie?error=...
 * pour affichage du bandeau de rebound cote landing.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyAffilieMagicToken,
  signAffilieSessionToken,
  AffilieTokenError,
  AFFILIE_SESSION_COOKIE,
  AFFILIE_SESSION_MAX_AGE,
} from '@/lib/affilie/jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[affilie/login]';

function pickLocale(input: string | null): 'fr' | 'en' {
  return input === 'en' ? 'en' : 'fr';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const locale = pickLocale(url.searchParams.get('locale'));

  const reboundUrl = (errorCode: 'invalid' | 'expired' | 'generic') =>
    new URL(`/${locale}/affilie?error=${errorCode}`, req.url);

  if (!token) {
    console.warn('%s missing-token', LOG_PREFIX);
    return NextResponse.redirect(reboundUrl('invalid'));
  }

  let affiliateId: string;
  try {
    const claims = await verifyAffilieMagicToken(token);
    affiliateId = claims.affiliateId;
  } catch (err) {
    const code = err instanceof AffilieTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject token code=%s', LOG_PREFIX, code);
    return NextResponse.redirect(reboundUrl(code));
  }

  let sessionToken: string;
  try {
    sessionToken = await signAffilieSessionToken(affiliateId);
  } catch (err) {
    console.error(
      '%s session-sign-failed affiliate=%s msg=%s',
      LOG_PREFIX,
      affiliateId,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.redirect(reboundUrl('generic'));
  }

  // Best-effort : poser last_login_at pour le suivi admin. Si echec on
  // continue (la session est deja signee).
  try {
    const supabase = getSupabaseServiceClient();
    await supabase
      .from('affiliates')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', affiliateId);
  } catch (err) {
    console.warn(
      '%s last-login-update-failed affiliate=%s msg=%s',
      LOG_PREFIX,
      affiliateId,
      err instanceof Error ? err.message : String(err),
    );
  }

  const dashboardUrl = new URL(`/${locale}/affilie/dashboard`, req.url);
  const response = NextResponse.redirect(dashboardUrl);
  const isSecure = process.env.NODE_ENV === 'production';
  response.cookies.set(AFFILIE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: AFFILIE_SESSION_MAX_AGE,
  });

  console.log(
    '%s success affiliate=%s redirectTo=%s',
    LOG_PREFIX,
    affiliateId,
    dashboardUrl.toString(),
  );

  return response;
}
