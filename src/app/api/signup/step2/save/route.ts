/**
 * POST /api/signup/step2/save
 *
 * Sauvegarde partielle de l'etape 2 (autosave entre sections du wizard).
 * Identifie le signup via le cookie HMAC mds_step2_session.
 *
 * Reponses :
 *   200 { success: true }
 *   401 { error: 'no_session' }       -- cookie absent ou invalide
 *   404 { error: 'not_found' }        -- signup introuvable
 *   409 { error: 'already_done' }     -- signup deja step2_completed/converted
 *   400 { error: 'invalid_payload' }
 *   500 { error: 'internal_error' }
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { STEP2_SESSION_COOKIE, verifyStep2SessionValue } from '@/lib/signup/session';
import { step2SavePartialSchema } from '@/lib/signup/step2-schema';

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

  const parsed = step2SavePartialSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('public_signup_attempts')
    .select('id, status, step2_payload')
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
    return NextResponse.json({ error: 'already_done' }, { status: 409 });
  }

  // Merge partiel : on conserve les champs deja stockes + ecrase ceux fournis.
  const previous =
    typeof existing.step2_payload === 'object' && existing.step2_payload !== null
      ? (existing.step2_payload as Record<string, unknown>)
      : {};
  const merged = { ...previous, ...parsed.data };

  // Bascule en step2_started si on est encore en verified (premier save).
  const nextStatus = existing.status === 'verified' ? 'step2_started' : existing.status;

  const { error: updateErr } = await supabase
    .from('public_signup_attempts')
    .update({
      step2_payload: merged,
      status: nextStatus,
    })
    .eq('id', session.signupId);

  if (updateErr) {
    console.error('[step2/save] UPDATE failed', updateErr);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
