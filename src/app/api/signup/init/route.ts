/**
 * POST /api/signup/init
 *
 * Etape 1 du formulaire d'inscription publique.
 * - Valide le payload (Zod)
 * - hCaptcha + NeverBounce + anti-doublon
 * - Classification IA (best-effort)
 * - INSERT public_signup_attempts + envoi email DOI Brevo
 *
 * Reponses :
 *   200 { success: true, signupId }
 *   422 { success: false, error: 'invalid_payload' | 'captcha_failed' | 'email_undeliverable' }
 *   409 { success: false, error: 'email_duplicate_recent' | 'email_duplicate_prospect' }
 *   429 { success: false, error: 'rate_limited', retryAfter }
 *   500 { success: false, error: 'internal_error' }
 */
import { NextResponse } from 'next/server';
import { signupStep1Schema } from '@/lib/signup/schema';
import { initSignup } from '@/lib/signup/init';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';
import { PENDING_SIGNUP_COOKIE, PENDING_SIGNUP_COOKIE_MAX_AGE_SECONDS } from '@/lib/signup/cookies';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');

  const rl = checkRateLimit({
    key: `signup-init:${ip}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'rate_limited', retryAfter: rl.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }

  const parsed = signupStep1Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }

  const result = await initSignup(parsed.data, { ip, userAgent });

  if (!result.ok) {
    const status =
      result.error === 'email_duplicate_recent' || result.error === 'email_duplicate_prospect'
        ? 409
        : result.error === 'captcha_failed' || result.error === 'email_undeliverable'
          ? 422
          : 500;
    return NextResponse.json({ success: false, error: result.error }, { status });
  }

  const response = NextResponse.json({ success: true, signupId: result.signupId });

  // Cookie pour permettre /api/signup/resend-doi de retrouver le signup
  // sans exposer l'id en query string.
  if (result.signupId && result.signupId !== 'honeypot-noop') {
    response.cookies.set(PENDING_SIGNUP_COOKIE, result.signupId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PENDING_SIGNUP_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
