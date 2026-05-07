/**
 * Webhook Sellsy — endpoint /api/webhooks/sellsy.
 *
 * - GET  -> 405
 * - POST -> verifie signature HMAC SHA1 + idempotence + dispatch.
 *
 * Idempotence : table sellsy_events_processed (PK event_id text). Si event
 * deja insere -> 200 immediat sans re-traiter.
 *
 * Verif signature (quirks Sellsy V2 #20 + #21 memory bank) :
 *   - Header : `x-webhook-signature` (PAS x-sellsy-signature)
 *   - Algorithme : HMAC SHA1 (PAS SHA256) — 40 chars hex
 *   - Match : crypto.createHmac('sha1', SELLSY_WEBHOOK_SECRET).update(rawBody).digest('hex')
 *
 * Logs structures (prefix [sellsy/webhook-route]).
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleSellsyEvent, type SellsyWebhookEvent } from '@/lib/sellsy/webhook-handler';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sellsy/webhook-route]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request): Promise<NextResponse> {
  // Quirk Sellsy V2 #20 : header `x-webhook-signature` (pas
  // x-sellsy-signature). Confirme via log debug en prod.
  const sigHeader = req.headers.get('x-webhook-signature');
  if (!sigHeader) {
    console.warn('%s missing-signature', LOG_PREFIX);
    return new NextResponse('Missing signature', { status: 400 });
  }

  const secret = process.env.SELLSY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('%s SELLSY_WEBHOOK_SECRET missing in env', LOG_PREFIX);
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const rawBody = await req.text();

  // Quirk Sellsy V2 #21 : HMAC SHA1 (40 chars hex), pas SHA256.
  // Confirmé via log debug : signature reçue de 40 chars = sha1 digest.
  // Comparison constant-time pour eviter les timing attacks.
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(sigHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  const sigValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!sigValid) {
    console.error('%s invalid-signature', LOG_PREFIX);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // Parse JSON apres verif signature uniquement.
  let event: SellsyWebhookEvent;
  try {
    event = JSON.parse(rawBody) as SellsyWebhookEvent;
  } catch (err) {
    console.error(
      '%s body-parse-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Idempotence cle : event_id si fourni, sinon hash du body.
  const eventId =
    event.event_id ??
    `sha256-${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`;
  const eventType = event.type ?? 'unknown';

  const supabase = getSupabaseServiceClient();
  const payloadJson = JSON.parse(JSON.stringify(event));
  const { data: inserted, error: insErr } = await supabase
    .from('sellsy_events_processed')
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload: payloadJson,
    })
    .select('event_id');

  if (insErr) {
    if (insErr.code === '23505') {
      console.log('%s already-processed event_id=%s', LOG_PREFIX, eventId);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('%s insert-failed event_id=%s msg=%s', LOG_PREFIX, eventId, insErr.message);
    return new NextResponse('DB error', { status: 500 });
  }

  if (!inserted || inserted.length === 0) {
    console.log('%s already-processed-silent event_id=%s', LOG_PREFIX, eventId);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleSellsyEvent(event);
  } catch (err) {
    console.error(
      '%s handler-failed event_id=%s msg=%s',
      LOG_PREFIX,
      eventId,
      err instanceof Error ? err.message : String(err),
    );
    // 200 quand meme : event persiste, l'admin peut rejouer manuellement.
    return NextResponse.json({
      received: true,
      handler_error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}
