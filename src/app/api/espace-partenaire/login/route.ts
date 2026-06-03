/**
 * GET /api/espace-partenaire/login?token=...&locale=fr|en — P5.x.2.bis
 *
 * Route Handler qui consomme le magic-link envoye par email :
 *   1. Lit ?token=... + ?locale=...
 *   2. verifyMagicToken (TTL 15min, type=magic)
 *   3. signSessionToken (TTL 8h, type=session)
 *   4. NextResponse.redirect /[locale]/espace-partenaire/dashboard
 *      avec cookie HttpOnly Secure SameSite=Lax pose sur la response.
 *
 * Conversion P5.x.2.bis : initialement c'etait un Server Component
 * (page.tsx) qui faisait `cookies().set()`, mais Next.js 15 interdit ca
 * dans un Server Component (autorise uniquement dans une Route Handler
 * ou une Server Action). Le redirect 307 vers /dashboard avec le
 * cookie sur la response resout le 500.
 *
 * Les erreurs (token absent / invalide / expire) redirigent vers la
 * page form `/[locale]/espace-partenaire?error=expired|invalid` qui
 * affiche le bandeau de rebound (deja en place depuis P5.x.2).
 *
 * Tracking : on log [espace-partenaire/login] success/expired/invalid
 * pour analytics + debug.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyMagicToken,
  signSessionToken,
  signContactSessionToken,
  EspacePartenaireTokenError,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  ESPACE_EXPOSANT_SESSION_MAX_AGE,
} from '@/lib/espace-partenaire/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[espace-partenaire/login]';

function pickLocale(input: string | null): 'fr' | 'en' {
  return input === 'en' ? 'en' : 'fr';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const locale = pickLocale(url.searchParams.get('locale'));

  const reboundUrl = (errorCode: 'invalid' | 'expired' | 'generic') =>
    new URL(`/${locale}/espace-partenaire?error=${errorCode}`, req.url);

  if (!token) {
    console.warn('%s missing-token', LOG_PREFIX);
    return NextResponse.redirect(reboundUrl('invalid'));
  }

  let subjectId: string;
  let kind: 'prospect' | 'contact';
  try {
    const claims = await verifyMagicToken(token);
    subjectId = claims.prospectId; // sub = contact_id si kind='contact', sinon prospect_id
    kind = claims.kind;
  } catch (err) {
    const code =
      err instanceof EspacePartenaireTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject token code=%s', LOG_PREFIX, code);
    return NextResponse.redirect(reboundUrl(code));
  }

  let sessionToken: string;
  try {
    // P8.2 : on regenere un session token du meme kind que le magic.
    sessionToken =
      kind === 'contact'
        ? await signContactSessionToken(subjectId)
        : await signSessionToken(subjectId);
  } catch (err) {
    console.error(
      '%s session-sign-failed subject=%s kind=%s msg=%s',
      LOG_PREFIX,
      subjectId,
      kind,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.redirect(reboundUrl('generic'));
  }

  const dashboardUrl = new URL(`/${locale}/espace-partenaire/dashboard`, req.url);
  const response = NextResponse.redirect(dashboardUrl);
  const isSecure = process.env.NODE_ENV === 'production';
  response.cookies.set(ESPACE_EXPOSANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: ESPACE_EXPOSANT_SESSION_MAX_AGE,
  });

  // P5.x.17-bis : log diagnostics (Vercel logs) pour confirmer que le
  // cookie est bien pose sur la response. Si Phil rapporte "no cookie
  // dans DevTools", on peut comparer ce log a ce que le browser recoit.
  console.log(
    '%s success subject=%s kind=%s locale=%s cookieName=%s secure=%s maxAge=%d redirectTo=%s',
    LOG_PREFIX,
    subjectId,
    kind,
    locale,
    ESPACE_EXPOSANT_SESSION_COOKIE,
    isSecure,
    ESPACE_EXPOSANT_SESSION_MAX_AGE,
    dashboardUrl.toString(),
  );

  return response;
}
