/**
 * POST /api/signup/step2/submit
 *
 * Soumission finale de l'etape 2.
 * - Valide le payload complet (Cas A ou Cas B).
 * - UPDATE status='step2_completed' + step2_submitted_at = now() + step2_payload final.
 * - Renvoie un ref signe HMAC pour rediriger vers /merci?s=<ref> sans
 *   exposer l'id en clair.
 *
 * Reponses :
 *   200 { success: true, ref: '<signed>' }
 *   401 { error: 'no_session' }
 *   404 { error: 'not_found' }
 *   409 { error: 'already_done' }
 *   400 { error: 'invalid_payload' }
 *   500 { error: 'internal_error' }
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  STEP2_SESSION_COOKIE,
  verifyStep2SessionValue,
  signPublicSignupRef,
} from '@/lib/signup/session';
import { step2SubmitSchema } from '@/lib/signup/step2-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionRaw = cookieStore.get(STEP2_SESSION_COOKIE)?.value;
  const session = verifyStep2SessionValue(sessionRaw);
  if (!session) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const parsed = step2SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('public_signup_attempts')
    .select('id, status, derived_category, language')
    .eq('id', session.signupId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (
    existing.status === 'step2_completed' ||
    existing.status === 'converted' ||
    existing.status === 'rejected' ||
    existing.status === 'expired'
  ) {
    // Idempotent : si deja completed, on renvoie le ref signe pour /merci.
    if (existing.status === 'step2_completed' || existing.status === 'converted') {
      const ref = signPublicSignupRef(existing.id);
      return NextResponse.json({ success: true, ref });
    }
    return NextResponse.json({ error: 'already_done' }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from('public_signup_attempts')
    .update({
      step2_payload: parsed.data,
      step2_submitted_at: new Date().toISOString(),
      status: 'step2_completed',
      cgv_accepted_at:
        parsed.data.mode === 'caseA' && parsed.data.cgvAccepted ? new Date().toISOString() : null,
    })
    .eq('id', session.signupId);

  if (updateErr) {
    console.error('[step2/submit] UPDATE failed', updateErr);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  const ref = signPublicSignupRef(session.signupId);
  return NextResponse.json({ success: true, ref });
}
