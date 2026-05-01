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

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
   * Ne tourne pas sur :
   *  - `/api/*`     (pas de localisation des routes API)
   *  - `/_next/*`   (assets Next)
   *  - `/_vercel/*` (Vercel internal)
   *  - `/brand/*`, `/video/*`, fichiers du dossier public
   *  - le hook test Sentry (P0)
   */
  matcher:
    '/((?!api|_next|_vercel|brand|video|sentry-test|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)',
};
