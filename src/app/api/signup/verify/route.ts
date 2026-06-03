/**
 * GET /api/signup/verify
 *
 * Verification du DOI. Appele par le bouton dans l'email Brevo.
 *
 * 2 modes supportes (rétrocompatibilité pendant le déploiement) :
 *   - `?t=<short_token>&loc=<fr|en>` : nouveau format compact (P3 M5.4-bis,
 *     ~80 chars total, evite les 404 du tracker Brevo sur longues URLs)
 *   - `?token=<jwt>&locale=<fr|en>` : ancien format JWT (P3 M3, conserve
 *     pour les liens deja envoyes avant le passage en short token)
 *
 * Flow :
 *   1. Lookup signup par short_token OR doi_token
 *   2. Verifier expiration cote DB
 *   3. status='converted' -> redirect /<locale>/merci avec ref signe
 *      status='expired'|'rejected' -> redirect /<locale>/inscription-partenaire?expired=1
 *      status='awaiting_verification' -> bascule en 'verified' + verified_at = now()
 *      status='verified'|'step2_started'|'step2_completed' -> on continue
 *   4. Set cookie HMAC mds_step2_session
 *   5. Redirect 302 vers /<locale>/inscription-partenaire/step2
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
  fr: '/fr/inscription-partenaire/etape-2',
  en: '/en/partner-registration/step-2',
};

const RESTART_SLUG: Record<'fr' | 'en', string> = {
  fr: '/fr/inscription-partenaire',
  en: '/en/partner-registration',
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
  const shortToken = url.searchParams.get('t');
  const jwtToken = url.searchParams.get('token');
  const localeFallback = pickLocale(url.searchParams.get('loc') ?? url.searchParams.get('locale'));

  if (!shortToken && !jwtToken) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?expired=1`);
  }

  // 1. Lookup signup
  //    Priorite au short_token (mode normal P3 M5+).
  //    Fallback JWT pour les liens envoyes avant le passage en short_token.
  const supabase = getSupabaseServiceClient();
  let signup: SignupForVerify | null = null;
  let lookupError = false;

  if (shortToken) {
    const { data, error } = await supabase
      .from('public_signup_attempts')
      .select(
        'id, email, language, status, short_token, short_token_expires_at, doi_token, doi_token_expires_at, verified_at, converted_to_prospect_id',
      )
      .eq('short_token', shortToken)
      .maybeSingle();
    if (error) lookupError = true;
    signup = (data as SignupForVerify | null) ?? null;
  } else if (jwtToken) {
    // Branche legacy : verify JWT pour extraire signupId puis lookup.
    let claimsSignupId: string;
    try {
      const verified = await verifyDoiToken(jwtToken);
      claimsSignupId = verified.signupId;
    } catch (err) {
      if (err instanceof DoiTokenError && err.code === 'expired') {
        return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?expired=1`);
      }
      return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?invalid=1`);
    }
    const { data, error } = await supabase
      .from('public_signup_attempts')
      .select(
        'id, email, language, status, short_token, short_token_expires_at, doi_token, doi_token_expires_at, verified_at, converted_to_prospect_id',
      )
      .eq('id', claimsSignupId)
      .maybeSingle();
    if (error) lookupError = true;
    signup = (data as SignupForVerify | null) ?? null;
    // Verifie que le JWT presente est bien le courant (rotation invalide les precedents).
    if (signup && signup.doi_token !== jwtToken) {
      return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?expired=1`);
    }
  }

  if (lookupError || !signup) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[localeFallback]}?notfound=1`);
  }

  const signupLocale: 'fr' | 'en' = signup.language === 'EN' ? 'en' : 'fr';

  // 2. Check expiration (cote DB pour les 2 modes)
  const expiresAt = shortToken ? signup.short_token_expires_at : signup.doi_token_expires_at;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?expired=1`);
  }

  // 3. Idempotent par status
  if (signup.status === 'converted') {
    const ref = signPublicSignupRef(signup.id);
    return NextResponse.redirect(`${getBaseUrl()}${THANKYOU_SLUG[signupLocale]}?s=${ref}`);
  }

  if (signup.status === 'expired' || signup.status === 'rejected') {
    return NextResponse.redirect(`${getBaseUrl()}${RESTART_SLUG[signupLocale]}?expired=1`);
  }

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

    // P5.x.8 : ajoute le contact a la liste Brevo "MDS Verified Pas
    // Converted" pour declencher la sequence J+1/J+3/J+7. Best-effort,
    // ne bloque pas la redirection step2 si Brevo down.
    void (async () => {
      try {
        const { syncSignupLifecycle } = await import('@/lib/brevo/sync-signup-lifecycle');
        await syncSignupLifecycle(signup.id);
      } catch (err) {
        console.error(
          '[signup/verify] signup-lifecycle-failed signup=%s msg=%s',
          signup.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    })();
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

interface SignupForVerify {
  id: string;
  email: string;
  language: 'FR' | 'EN';
  status: string;
  short_token: string | null;
  short_token_expires_at: string | null;
  doi_token: string | null;
  doi_token_expires_at: string | null;
  verified_at: string | null;
  converted_to_prospect_id: string | null;
}
