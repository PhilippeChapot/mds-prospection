/**
 * POST /[locale]/espace-partenaire/logout — P5.x.2 / P5.x.17-ter.
 *
 * Efface le cookie de session Espace Partenaire et redirige vers la page
 * de demande de magic-link.
 *
 * P5.x.17-ter fix critique : on supprime la variante GET. Raison =
 * Next.js prefetch automatique des `<Link>` rendait la GET du logout
 * lorsque le sidebar etait rendu, ce qui SUPPRIMAIT le cookie de
 * session a peine pose par le magic-link login. Diagnostic confirme
 * par les logs Vercel :
 *
 *   14:26:18 [espace-partenaire/login] success cookie pose
 *   14:26:19 GET /fr/espace-partenaire/logout  (prefetch <Link>)
 *   14:26:24 GET /dashboard/coordonnees  no-cookie -> redirect login
 *
 * Doctrine generale : aucune route destructive (logout, delete) en GET.
 * Toute mutation passe par POST -> impossible a prefetch par <Link>.
 *
 * Le client utilise <LogoutButton /> (form POST + bouton classique).
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ESPACE_EXPOSANT_SESSION_COOKIE } from '@/lib/espace-partenaire/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const cookieStore = await cookies();
  cookieStore.delete(ESPACE_EXPOSANT_SESSION_COOKIE);

  const url = new URL(request.url);
  const redirectUrl = new URL(`/${locale}/espace-partenaire`, url.origin);
  console.log('[espace-partenaire/logout] success locale=%s', locale);
  // 303 See Other : le bon code pour rediriger apres un POST vers une
  // resource GET (la page form). Avec 307 on conserverait la methode,
  // ici on veut le GET de la page suivante.
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
