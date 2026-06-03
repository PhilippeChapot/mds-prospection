import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';
import {
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  isValidAffiliateToken,
} from '@/lib/affiliates/cookie';

/**
 * Next 16 — equivalent du middleware classique (renomme `proxy.ts`).
 *
 * Dispatch :
 *   - `/admin/**`  -> refresh session Supabase + garde auth (sauf /admin/login)
 *   - sinon        -> middleware next-intl (routes publiques /[locale]/**)
 *
 * Le check du role public.users.role se fait DANS le layout serveur
 * `app/admin/(authenticated)/layout.tsx` (pas dans le proxy Edge — pour
 * eviter une requete DB sur chaque hop).
 */

const intlMiddleware = createMiddleware(routing);

/**
 * Bot scanners (WordPress / Joomla / phpMyAdmin) tapent en permanence sur
 * /wp-admin/install.php, /xmlrpc.php, /administrator/, /phpmyadmin/, etc.
 *
 * Sans early-return, Next.js sert une 404 dynamique qui charge le layout
 * root + react-markdown -> import transitif jsdom -> crash ERR_REQUIRE_ESM
 * en runtime serverless. Le matcher de config inclut explicitement ces
 * patterns pour que le middleware tourne dessus (sinon le `.*\\..*` les
 * exclurait au niveau .php).
 */
const SCANNER_PATTERNS =
  /^\/(wp-admin|wp-includes|wp-content|wp-login\.php|xmlrpc\.php|administrator|phpmyadmin|setup-config\.php)/i;

/**
 * P7.x.1.F-bis — pose le cookie tracking affilie sur n'importe quelle
 * response qui passe par le proxy quand l'URL contient `?ref=<token>`.
 *
 * Volontairement pas de query DB ici (proxy Edge runtime, performance).
 * Validation regex format uniquement (alphanum + _ + - + .). La verif
 * `affiliates.is_active=true` se fait downstream dans `signup/init.ts`
 * qui resoud le token en `affiliate_id` (ou null si inconnu/inactif).
 *
 * Pas de redirect — on garde `?ref=` dans l'URL pour permettre a
 * d'autres consommateurs (analytics, debug) de voir la valeur. Le
 * cookie persiste 90j (cf. AFFILIATE_COOKIE_MAX_AGE_SECONDS).
 */
function attachAffiliateCookie(request: NextRequest, response: NextResponse): NextResponse {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || !isValidAffiliateToken(ref)) {
    if (ref) {
      console.log(
        '[proxy/affiliate] invalid-ref-format ref=%s path=%s',
        ref,
        request.nextUrl.pathname,
      );
    }
    return response;
  }
  response.cookies.set(AFFILIATE_COOKIE, ref, {
    httpOnly: false, // accessible JS pour le wizard SPA (cf. P5.x.7 doctrine)
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  });
  console.log(
    '[proxy/affiliate] cookie-set ref=%s path=%s maxAge=%d',
    ref,
    request.nextUrl.pathname,
    AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  );
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SCANNER_PATTERNS.test(pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (pathname.startsWith('/admin')) {
    const { supabaseResponse, user } = await updateSession(request);

    const isLoginPage = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
    if (!user && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return attachAffiliateCookie(request, NextResponse.redirect(url));
    }

    if (user && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return attachAffiliateCookie(request, NextResponse.redirect(url));
    }

    return attachAffiliateCookie(request, supabaseResponse);
  }

  const intlResponse = intlMiddleware(request);
  return attachAffiliateCookie(request, intlResponse);
}

export const config = {
  /*
   * Matcher principal — ne tourne pas sur :
   *  - `/api/*`     (pas de localisation des routes API)
   *  - `/_next/*`   (assets Next)
   *  - `/_vercel/*` (Vercel internal)
   *  - `/brand/*`, `/video/*`, fichiers du dossier public
   *  - le hook test Sentry (P0)
   *  - `/merci-oui` + `/merci-non` (pages RSVP Brevo standalone, pas
   *    localisees, sinon next-intl tente une redirection vers /fr/merci-oui
   *    qui n'existe pas et plante en server error).
   *  - `/i/<id>` (P5.x.16 — route redirect tracking pour invitations
   *    visiteurs envoyees par les partenaires. URL courte sans locale
   *    pour faire propre dans les emails. Sert le route handler
   *    src/app/i/[companyId]/route.ts directement.)
   *
   * Matchers additionnels pour SCANNER_PATTERNS :
   *  - `.php` URLs (wp-login.php, xmlrpc.php, setup-config.php) que le
   *    pattern `.*\\..*` du matcher principal exclurait. Les routes
   *    sans extension (/wp-admin, /administrator, /phpmyadmin) sont
   *    deja capturees par le matcher principal.
   */
  matcher: [
    '/((?!api|_next|_vercel|auth|brand|video|sentry-test|favicon\\.ico|robots\\.txt|sitemap\\.xml|merci-oui|merci-non|i/|.*\\..*).*)',
    '/wp-login.php',
    '/wp-admin/install.php',
    '/xmlrpc.php',
    '/setup-config.php',
    '/admin/install.php',
  ],
};
