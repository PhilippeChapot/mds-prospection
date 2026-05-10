import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  verifyMagicToken,
  signSessionToken,
  EspaceExposantTokenError,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  ESPACE_EXPOSANT_SESSION_MAX_AGE,
} from '@/lib/espace-exposant/jwt';
import type { Locale } from 'next-intl';

const LOG_PREFIX = '[espace-exposant/login]';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Connexion Espace Exposant',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string }>;
}

/**
 * Page server-side qui consomme le magic-link :
 *   1. Lit ?token=...
 *   2. verifyMagicToken (TTL 15min, type=magic)
 *   3. signSessionToken (TTL 8h, type=session)
 *   4. Set cookie HttpOnly Secure SameSite=Lax
 *   5. Redirect /espace-exposant/dashboard
 *
 * En cas d'echec : redirect /espace-exposant?error=expired|invalid
 * (jamais de detail technique exposé au client).
 */
export default async function EspaceExposantLoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const token = sp.token?.trim();

  if (!token) {
    redirect(`/${locale}/espace-exposant?error=invalid`);
  }

  let prospectId: string;
  try {
    const claims = await verifyMagicToken(token);
    prospectId = claims.prospectId;
  } catch (err) {
    const code =
      err instanceof EspaceExposantTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject token code=%s', LOG_PREFIX, code);
    redirect(`/${locale}/espace-exposant?error=${code}`);
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
    redirect(`/${locale}/espace-exposant?error=generic`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ESPACE_EXPOSANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ESPACE_EXPOSANT_SESSION_MAX_AGE,
  });

  console.log('%s success prospect=%s locale=%s', LOG_PREFIX, prospectId, locale);

  redirect(`/${locale}/espace-exposant/dashboard`);
}
