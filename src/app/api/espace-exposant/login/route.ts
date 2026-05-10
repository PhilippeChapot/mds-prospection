/**
 * GET /api/espace-exposant/login?token=...&locale=fr|en — P5.x.2.bis
 *
 * Route Handler qui consomme le magic-link envoye par email :
 *   1. Lit ?token=... + ?locale=...
 *   2. verifyMagicToken (TTL 15min, type=magic)
 *   3. signSessionToken (TTL 8h, type=session)
 *   4. NextResponse.redirect /[locale]/espace-exposant/dashboard
 *      avec cookie HttpOnly Secure SameSite=Lax pose sur la response.
 *
 * Conversion P5.x.2.bis : initialement c'etait un Server Component
 * (page.tsx) qui faisait `cookies().set()`, mais Next.js 15 interdit ca
 * dans un Server Component (autorise uniquement dans une Route Handler
 * ou une Server Action). Le redirect 307 vers /dashboard avec le
 * cookie sur la response resout le 500.
 *
 * Les erreurs (token absent / invalide / expire) redirigent vers la
 * page form `/[locale]/espace-exposant?error=expired|invalid` qui
 * affiche le bandeau de rebound (deja en place depuis P5.x.2).
 *
 * Tracking : on log [espace-exposant/login] success/expired/invalid
 * pour analytics + debug.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyMagicToken,
  signSessionToken,
  EspaceExposantTokenError,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  ESPACE_EXPOSANT_SESSION_MAX_AGE,
} from '@/lib/espace-exposant/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[espace-exposant/login]';

function pickLocale(input: string | null): 'fr' | 'en' {
  return input === 'en' ? 'en' : 'fr';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const locale = pickLocale(url.searchParams.get('locale'));

  const reboundUrl = (errorCode: 'invalid' | 'expired' | 'generic') =>
    new URL(`/${locale}/espace-exposant?error=${errorCode}`, req.url);

  if (!token) {
    console.warn('%s missing-token', LOG_PREFIX);
    return NextResponse.redirect(reboundUrl('invalid'));
  }

  let prospectId: string;
  try {
    const claims = await verifyMagicToken(token);
    prospectId = claims.prospectId;
  } catch (err) {
    const code =
      err instanceof EspaceExposantTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject token code=%s', LOG_PREFIX, code);
    return NextResponse.redirect(reboundUrl(code));
  }

  let sessionToken: string;
  try {
    sessionToken = await signSessionToken(prospectId);
  } catch (err) {
    console.error(
      '%s session-sign-failed prospect=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.redirect(reboundUrl('generic'));
  }

  const dashboardUrl = new URL(`/${locale}/espace-exposant/dashboard`, req.url);
  const response = NextResponse.redirect(dashboardUrl);
  response.cookies.set(ESPACE_EXPOSANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ESPACE_EXPOSANT_SESSION_MAX_AGE,
  });

  console.log('%s success prospect=%s locale=%s', LOG_PREFIX, prospectId, locale);

  return response;
}
