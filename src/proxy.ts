import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

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
      return NextResponse.redirect(url);
    }

    if (user && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  return intlMiddleware(request);
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
   *
   * Matchers additionnels pour SCANNER_PATTERNS :
   *  - `.php` URLs (wp-login.php, xmlrpc.php, setup-config.php) que le
   *    pattern `.*\\..*` du matcher principal exclurait. Les routes
   *    sans extension (/wp-admin, /administrator, /phpmyadmin) sont
   *    deja capturees par le matcher principal.
   */
  matcher: [
    '/((?!api|_next|_vercel|auth|brand|video|sentry-test|favicon\\.ico|robots\\.txt|sitemap\\.xml|merci-oui|merci-non|.*\\..*).*)',
    '/wp-login.php',
    '/wp-admin/install.php',
    '/xmlrpc.php',
    '/setup-config.php',
    '/admin/install.php',
  ],
};
