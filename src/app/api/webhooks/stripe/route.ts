/**
 * Webhook Stripe — endpoint /api/webhooks/stripe.
 *
 * - GET    -> 405 Method Not Allowed
 * - POST   -> verif signature stripe-signature, idempotence, dispatch
 *
 * Idempotence : INSERT INTO stripe_events_processed (event_id, ...)
 * ON CONFLICT (event_id) DO NOTHING. Si row deja existante (Stripe
 * retry sur timeout), on retourne 200 sans rien faire d'autre.
 *
 * Logs structures (prefix [stripe/webhook-route]).
 */

import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { handleStripeEvent } from '@/lib/stripe/webhook-handler';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[stripe/webhook-route]';

// Pas de cache, pas de revalidate — chaque appel Stripe est unique.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    console.warn('%s missing-signature', LOG_PREFIX);
    return new NextResponse('Missing signature', { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('%s STRIPE_WEBHOOK_SECRET missing in env', LOG_PREFIX);
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  // Stripe SDK exige le body brut (pas le JSON parse) pour valider la signature.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s invalid-signature msg=%s', LOG_PREFIX, msg);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // Idempotence — INSERT ON CONFLICT DO NOTHING via Supabase upsert(ignoreDuplicates).
  const supabase = getSupabaseServiceClient();
  // payload est un jsonb : Stripe.Event est un objet JSON-serializable
  // mais TypeScript ne le sait pas (PG types stricts via supabase-js).
  // On serialize/deserialize pour traverser proprement le type guard.
  const payloadJson = JSON.parse(JSON.stringify(event));
  const { data: inserted, error: insErr } = await supabase
    .from('stripe_events_processed')
    .insert({
      event_id: event.id,
      event_type: event.type,
      payload: payloadJson,
    })
    .select('event_id');

  if (insErr) {
    // 23505 = unique_violation (PG) → event deja traite, c'est OK.
    if (insErr.code === '23505') {
      console.log('%s already-processed event=%s', LOG_PREFIX, event.id);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('%s insert-failed event=%s msg=%s', LOG_PREFIX, event.id, insErr.message);
    return new NextResponse('DB error', { status: 500 });
  }

  if (!inserted || inserted.length === 0) {
    // Pas d'erreur mais aucune ligne inseree -> conflict silencieux.
    console.log('%s already-processed-silent event=%s', LOG_PREFIX, event.id);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Dispatch metier (handler isole pour testabilite).
  try {
    await handleStripeEvent(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s handler-failed event=%s msg=%s', LOG_PREFIX, event.id, msg);
    // On retourne 200 pour eviter que Stripe re-essaie en boucle :
    // l'event est deja persiste dans stripe_events_processed et l'admin
    // peut le rejouer manuellement via le dashboard si besoin.
    return NextResponse.json({ received: true, handler_error: msg });
  }

  return NextResponse.json({ received: true });
}
