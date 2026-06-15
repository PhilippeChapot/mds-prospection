import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ESPACE_VISITEUR_SESSION_COOKIE } from '@/lib/espace-visiteur/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const cookieStore = await cookies();
  cookieStore.delete(ESPACE_VISITEUR_SESSION_COOKIE);

  const url = new URL(request.url);
  const redirectUrl = new URL(`/${locale}/espace-visiteur`, url.origin);
  // 303 See Other: POST → GET (login page).
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
