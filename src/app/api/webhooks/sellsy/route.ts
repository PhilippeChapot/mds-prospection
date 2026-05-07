/**
 * Webhook Sellsy — endpoint /api/webhooks/sellsy.
 *
 * - GET  -> 405
 * - POST -> verifie signature SHA1 plain + idempotence + dispatch.
 *
 * Idempotence : table sellsy_events_processed (PK event_id text). Si event
 * deja insere -> 200 immediat sans re-traiter. event_id construit depuis
 * timestamp + eventType + event + ownerid quand Sellsy ne fournit pas un
 * id natif (cf. quirk #22).
 *
 * Verif signature (quirks Sellsy V2 #20 + #21 memory bank) :
 *   - Header : `x-webhook-signature` (40 chars hex)
 *   - Algorithme : SHA-1 PLAIN sur (secret + rawBody), pas HMAC.
 *     Match : crypto.createHash('sha1').update(secret + rawBody).digest('hex')
 *
 * Payload Sellsy V2 (quirk #22) :
 *   { eventType, event, timestamp, ownerid, ownertype, ... }
 *   eventType = "docslog" / "client" / "prospect" / "people"
 *   event     = "step" / "created" / "updated" / "emailsent"
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

  // Quirk #21 : SHA-1 plain sur (secret + body), 40 chars hex.
  // Pas HMAC (testé en debug, ne matche pas).
  const expected = crypto
    .createHash('sha1')
    .update(secret + rawBody)
    .digest('hex');
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

  // Idempotence : event_id construit depuis le payload Sellsy V2 puisqu'il
  // ne fournit pas un id natif. Combinaison timestamp + eventType + event
  // + ownerid + (premier hash du body) pour eviter les collisions.
  const eventId = buildEventId(event, rawBody);
  const eventType = `${event.eventType ?? 'unknown'}.${event.event ?? 'unknown'}`;

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
    return NextResponse.json({
      received: true,
      handler_error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}

/**
 * Construit un event_id stable pour l'idempotence Sellsy.
 * Sellsy V2 ne fournit pas d'event_id natif — on hash les champs cles
 * + un prefixe hex du raw body pour eviter les collisions sur des events
 * qui auraient les memes metadata (ex: 2 emails envoyes au meme moment).
 */
function buildEventId(event: SellsyWebhookEvent, rawBody: string): string {
  const ts = event.timestamp ?? 'no-ts';
  const cat = event.eventType ?? 'no-cat';
  const ev = event.event ?? 'no-ev';
  const owner = event.ownerid ?? 'no-owner';
  const bodyHash = crypto.createHash('sha1').update(rawBody).digest('hex').slice(0, 16);
  return `${ts}-${cat}-${ev}-${owner}-${bodyHash}`;
}
