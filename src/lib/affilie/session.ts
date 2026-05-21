/**
 * Helper session Espace Affilie — P7.x.1.A
 *
 * Mirror de `lib/espace-exposant/session.ts` (P5.x.2). Verifie le cookie
 * `affilie_session` + JWT, redirect vers /affilie?error=... si KO. ZERO
 * query DB pour rester cheap dans le layout shell.
 *
 * Utilise par `src/app/affilie/dashboard/layout.tsx`.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAffilieSessionToken, AFFILIE_SESSION_COOKIE, AffilieTokenError } from './jwt';

const LOG_PREFIX = '[affilie/session]';

export interface AffilieSession {
  affiliateId: string;
}

/**
 * Verifie la session affilie. Si KO, redirect vers /affilie?error=...
 * et ne renvoie jamais (throw next/navigation redirect). Sinon retourne
 * `{ affiliateId }`.
 */
export async function requireAffilieSession(): Promise<AffilieSession> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(AFFILIE_SESSION_COOKIE);
  if (!tokenCookie?.value) {
    redirect('/affilie?error=session_missing');
  }
  try {
    const claims = await verifyAffilieSessionToken(tokenCookie.value);
    return { affiliateId: claims.affiliateId };
  } catch (err) {
    const code = err instanceof AffilieTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s reject session code=%s', LOG_PREFIX, code);
    redirect(`/affilie?error=${code}`);
  }
}
