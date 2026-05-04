/**
 * POST /api/signup/resend-doi
 *
 * Renvoie l'email DOI pour le signup pending identifie par le cookie
 * `pending_signup_id` (pose par /api/signup/init).
 *
 * Rate limits :
 *   - cooldown 60s entre clics
 *   - max 3 renvois / signup / heure
 *
 * Reponses :
 *   200 { success: true }
 *   401 { error: 'no_pending' }       -- pas de cookie
 *   404 { error: 'not_found' }        -- signup introuvable
 *   410 { error: 'max_resend' }       -- limite 3 atteinte
 *   429 { error: 'cooldown', retryAfter }
 *   500 { error: 'internal_error' }
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { signDoiToken, computeDoiExpiresAt } from '@/lib/doi/jwt';
import { generateShortToken, computeShortTokenExpiresAt } from '@/lib/doi/short-token';
import { sendDoiEmail } from '@/lib/signup/init';
import { PENDING_SIGNUP_COOKIE } from '@/lib/signup/cookies';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  const signupId = cookieStore.get(PENDING_SIGNUP_COOKIE)?.value;
  if (!signupId) {
    return NextResponse.json({ error: 'no_pending' }, { status: 401 });
  }

  // 1. Cooldown 60s
  const cooldown = checkRateLimit({
    key: `resend-doi-cooldown:${signupId}`,
    limit: 1,
    windowSeconds: 60,
  });
  if (!cooldown.ok) {
    return NextResponse.json(
      { error: 'cooldown', retryAfter: cooldown.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(cooldown.retryAfterSeconds) } },
    );
  }

  // 2. Max 3 renvois / heure
  const cap = checkRateLimit({
    key: `resend-doi-cap:${signupId}`,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!cap.ok) {
    return NextResponse.json({ error: 'max_resend' }, { status: 410 });
  }

  // 3. Lookup signup
  const supabase = getSupabaseServiceClient();
  const { data: signup, error: signupErr } = await supabase
    .from('public_signup_attempts')
    .select('id, email, contact_first_name, language, status')
    .eq('id', signupId)
    .maybeSingle();

  if (signupErr || !signup) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (signup.status !== 'awaiting_verification') {
    // Deja verifie ou expire — on ne renvoie pas (pas pertinent).
    return NextResponse.json({ error: 'not_pending' }, { status: 409 });
  }

  // 4. Regenere short_token (utilise dans l'URL Brevo) + JWT (debug, parite avec init)
  //    Rotation = les liens precedents (short ET JWT) sont invalides.
  const newShortToken = generateShortToken();
  const newShortTokenExpiresAt = computeShortTokenExpiresAt();
  const newJwt = await signDoiToken({ signupId: signup.id, email: signup.email });
  const newJwtExpiresAt = computeDoiExpiresAt();

  const { error: updateErr } = await supabase
    .from('public_signup_attempts')
    .update({
      short_token: newShortToken,
      short_token_expires_at: newShortTokenExpiresAt.toISOString(),
      doi_token: newJwt,
      doi_token_expires_at: newJwtExpiresAt.toISOString(),
      verification_sent_at: new Date().toISOString(),
    })
    .eq('id', signup.id);

  if (updateErr) {
    console.error('[signup/resend-doi] UPDATE failed', updateErr);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  // 5. Envoi email avec l'URL courte
  try {
    await sendDoiEmail({
      email: signup.email,
      firstName: signup.contact_first_name ?? '',
      locale: signup.language === 'EN' ? 'en' : 'fr',
      token: newShortToken,
    });
  } catch (err) {
    console.error('[signup/resend-doi] Brevo send failed', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
