/**
 * GET/POST /[locale]/espace-exposant/logout — P5.x.2.
 *
 * Efface le cookie de session Espace Exposant et redirige vers la page
 * de demande de magic-link.
 *
 * Accepte GET (lien <a href> dans le dashboard) et POST (formulaire si
 * besoin) pour rester souple.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ESPACE_EXPOSANT_SESSION_COOKIE } from '@/lib/espace-exposant/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request: Request, params: { locale: string }) {
  const cookieStore = await cookies();
  cookieStore.delete(ESPACE_EXPOSANT_SESSION_COOKIE);

  const url = new URL(request.url);
  const redirectUrl = new URL(`/${params.locale}/espace-exposant`, url.origin);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  return handle(request, await params);
}

export async function POST(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  return handle(request, await params);
}
