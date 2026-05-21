/**
 * POST /api/affilie/logout — P7.x.1.A
 *
 * Efface le cookie de session affilie + redirect vers la landing.
 * POST (et non GET) pour eviter le prefetch Link Next.js qui tuait la
 * session (cf. memoire `feedback_no_destructive_get`).
 */

import { NextResponse } from 'next/server';
import { AFFILIE_SESSION_COOKIE } from '@/lib/affilie/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const target = new URL('/affilie?signed_out=1', request.url);
  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(AFFILIE_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
