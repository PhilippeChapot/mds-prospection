import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Next 16 — equivalent du middleware classique, renomme `proxy.ts`.
 * Detecte Accept-Language, persiste le choix dans le cookie `NEXT_LOCALE`,
 * redirige `/` vers `/fr` ou `/en` selon le navigateur.
 */
const intlMiddleware = createMiddleware(routing);

export default function proxy(request: Parameters<typeof intlMiddleware>[0]) {
  return intlMiddleware(request);
}

export const config = {
  /*
   * Ne tourne pas sur :
   *  - `/api/*`     (pas de localisation des routes API)
   *  - `/_next/*`   (assets Next)
   *  - `/_vercel/*` (Vercel internal)
   *  - fichiers du dossier public (SVG, images, video, robots, sitemap, brand, etc.)
   *  - le hook test Sentry (P0)
   */
  matcher:
    '/((?!api|_next|_vercel|brand|video|sentry-test|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)',
};
