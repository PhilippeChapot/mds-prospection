/**
 * Helper session Espace Affilie — P7.x.1.A / a-bis
 *
 * Mirror de `lib/espace-exposant/session.ts` (P5.x.2). Verifie le cookie
 * `affilie_session` + JWT, redirect vers /{locale}/affilie?error=... si KO.
 * ZERO query DB pour rester cheap dans le layout shell.
 *
 * `locale` est obligatoire (passe par le layout / la page) pour que la
 * redirection respecte le prefixe i18n (next-intl `localePrefix: 'always'`).
 *
 * Utilise par `src/app/[locale]/(public)/affilie/dashboard/layout.tsx`.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAffilieSessionToken, AFFILIE_SESSION_COOKIE, AffilieTokenError } from './jwt';

const LOG_PREFIX = '[affilie/session]';

export interface AffilieSession {
  affiliateId: string;
}

/**
 * Verifie la session affilie. Si KO, redirect vers /{locale}/affilie?error=...
 * et ne renvoie jamais (throw next/navigation redirect). Sinon retourne
 * `{ affiliateId }`.
 */
export async function requireAffilieSession(locale: string): Promise<AffilieSession> {
  // Narrow defensivement : si une locale inattendue arrive (typage next-intl
  // = `string` au niveau du layout), on retombe sur 'fr'.
  const safeLocale = locale === 'en' ? 'en' : 'fr';
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(AFFILIE_SESSION_COOKIE);
  if (!tokenCookie?.value) {
    redirect(`/${safeLocale}/affilie?error=session_missing`);
  }
  try {
    const claims = await verifyAffilieSessionToken(tokenCookie.value);
    return { affiliateId: claims.affiliateId };
  } catch (err) {
    const code = err instanceof AffilieTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject session code=%s', LOG_PREFIX, code);
    redirect(`/${safeLocale}/affilie?error=${code}`);
  }
}
