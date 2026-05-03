/**
 * GET /api/signup/verify?token=<jwt>&locale=<fr|en>
 *
 * Verification du DOI. Appele par le bouton dans l'email Brevo.
 *
 * Flow :
 *   1. verifyDoiToken(token) -> claims { signupId, email, expiresAt }
 *      - JWT expire ou invalide -> redirect /<locale>/inscription-exposant?expired=1
 *   2. lookup signup
 *      - introuvable -> 404
 *      - status='converted' -> redirect /<locale>/merci avec le ref signe
 *      - status='expired'|'rejected' -> redirect /<locale>/inscription-exposant?expired=1
 *   3. UPDATE verified_at + status='verified' (idempotent — si deja verified on continue)
 *   4. Set cookie HMAC mds_step2_session
 *   5. Redirect 302 vers /<locale>/inscription-exposant/step2 (slug FR ou EN)
 */
import { NextResponse } from 'next/server';
import { verifyDoiToken, DoiTokenError } from '@/lib/doi/jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  createStep2SessionValue,
  STEP2_SESSION_COOKIE,
  STEP2_SESSION_TTL_SECONDS,
  signPublicSignupRef,
} from '@/lib/signup/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STEP2_SLUG: Record<'fr' | 'en', string> = {
  fr: '/fr/inscription-exposant/etape-2',
  en: '/en/exhibitor-registration/step-2',
};

const RESTART_SLUG: Record<'fr' | 'en', string> = {
  fr: '/fr/inscription-exposant',
  en: '/en/exhibitor-registration',
};

const THANKYOU_SLUG: Record<'fr' | 'en', string> = {
  fr: '/fr/merci',
  en: '/en/thank-you',
};

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function pickLocale(value: string | null): 'fr' | 'en' {
  return value === 'en' ? 'en' : 'fr';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const localeFallback = pickLocale(url.searchParams.get('locale'));

  if (!token) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?expired=1`);
  }

  // 1. Verify JWT
  let claims: { signupId: string; email: string };
  try {
    const verified = await verifyDoiToken(token);
    claims = { signupId: verified.signupId, email: verified.email };
  } catch (err) {
    if (err instanceof DoiTokenError && err.code === 'expired') {
      return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?expired=1`);
    }
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?invalid=1`);
  }

  // 2. Lookup signup
  const supabase = getSupabaseServiceClient();
  const { data: signup, error: signupErr } = await supabase
    .from('public_signup_attempts')
    .select(
      'id, email, language, status, doi_token, doi_token_expires_at, verified_at, converted_to_prospect_id',
    )
    .eq('id', claims.signupId)
    .maybeSingle();

  if (signupErr || !signup) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?notfound=1`);
  }

  const signupLocale: 'fr' | 'en' = signup.language === 'EN' ? 'en' : 'fr';

  // Verifie que le token presente correspond bien au token courant en base
  // (rotation au resend invalide les precedents).
  if (signup.doi_token !== token) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?expired=1`);
  }

  // Check expiration cote DB en plus du JWT (defense en profondeur).
  if (signup.doi_token_expires_at && new Date(signup.doi_token_expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?expired=1`);
  }

  // 3. Idempotent : si deja converti -> envoie sur /merci. Sinon UPDATE verified.
  if (signup.status === 'converted') {
    const ref = signPublicSignupRef(signup.id);
    return NextResponse.redirect(`${getBaseUrl()}${THANKYOU_SLUG[signupLocale]}?s=${ref}`);
  }

  if (signup.status === 'expired' || signup.status === 'rejected') {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?expired=1`);
  }

  // status in ('awaiting_verification', 'verified', 'step2_started', 'step2_completed')
  // -> on autorise la suite. Si c'etait awaiting, on bascule a verified.
  if (signup.status === 'awaiting_verification') {
    const { error: updateErr } = await supabase
      .from('public_signup_attempts')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .eq('id', signup.id);
    if (updateErr) {
      console.error('[signup/verify] UPDATE verified failed', updateErr);
      return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?error=1`);
    }
  }

  // 4. Set cookie HMAC + redirect step2
  const sessionValue = createStep2SessionValue(signup.id);
  const response = NextResponse.redirect(`${getBaseUrl()}${STEP2_SLUG[signupLocale]}`);
  response.cookies.set(STEP2_SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STEP2_SESSION_TTL_SECONDS,
  });
  return response;
}
