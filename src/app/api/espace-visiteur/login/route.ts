/**
 * GET /api/espace-visiteur/login?token=...&locale=fr|en — P15.3
 *
 * Consomme le magic-link visiteur : verify magic → session cookie 8h →
 * redirect /{locale}/espace-visiteur/accueil. Met à jour last_login_at.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyVisitorMagicToken,
  signVisitorSessionToken,
  EspaceVisiteurTokenError,
  ESPACE_VISITEUR_SESSION_COOKIE,
  ESPACE_VISITEUR_SESSION_MAX_AGE,
} from '@/lib/espace-visiteur/jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[espace-visiteur/login]';

function pickLocale(input: string | null): 'fr' | 'en' {
  return input === 'en' ? 'en' : 'fr';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const locale = pickLocale(url.searchParams.get('locale'));

  const reboundUrl = (errorCode: 'invalid' | 'expired' | 'generic') =>
    new URL(`/${locale}/espace-visiteur?error=${errorCode}`, req.url);

  if (!token) {
    console.warn('%s missing-token', LOG_PREFIX);
    return NextResponse.redirect(reboundUrl('invalid'));
  }

  let visitorId: string;
  try {
    const claims = await verifyVisitorMagicToken(token);
    visitorId = claims.visitorId;
  } catch (err) {
    const code =
      err instanceof EspaceVisiteurTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject token code=%s', LOG_PREFIX, code);
    return NextResponse.redirect(reboundUrl(code));
  }

  let sessionToken: string;
  try {
    sessionToken = await signVisitorSessionToken(visitorId);
  } catch (err) {
    console.error('%s session-sign-failed visitor=%s msg=%s', LOG_PREFIX, visitorId, err);
    return NextResponse.redirect(reboundUrl('generic'));
  }

  // Best-effort : last_login_at (le compte existe normalement déjà).
  try {
    const supabase = getSupabaseServiceClient();
    await supabase
      .from('visitor_accounts')
      .update({ last_login_at: new Date().toISOString() })
      .eq('visitor_id', visitorId);
  } catch {
    // non bloquant
  }

  const accueilUrl = new URL(`/${locale}/espace-visiteur/accueil`, req.url);
  const response = NextResponse.redirect(accueilUrl);
  response.cookies.set(ESPACE_VISITEUR_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ESPACE_VISITEUR_SESSION_MAX_AGE,
  });

  console.log('%s success visitor=%s locale=%s', LOG_PREFIX, visitorId, locale);
  return response;
}
