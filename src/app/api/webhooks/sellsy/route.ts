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

  // DEBUG TEMPORAIRE : Sellsy V2 doc ne specifie pas l'algo de signature.
  // SHA1 simple HMAC ne match pas en prod -> on teste 8 variantes en
  // parallele et on log laquelle matche. Une fois identifie, on patche
  // proprement (1 seul algo + retire ce bloc debug).
  const candidates: Record<string, string> = {
    'hmac-sha1-hex': crypto.createHmac('sha1', secret).update(rawBody).digest('hex'),
    'hmac-sha256-hex': crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'hmac-md5-hex': crypto.createHmac('md5', secret).update(rawBody).digest('hex'),
    'hmac-sha1-base64': crypto.createHmac('sha1', secret).update(rawBody).digest('base64'),
    'hmac-sha256-base64': crypto.createHmac('sha256', secret).update(rawBody).digest('base64'),
    'sha1-secret-then-body': crypto
      .createHash('sha1')
      .update(secret + rawBody)
      .digest('hex'),
    'sha1-body-then-secret': crypto
      .createHash('sha1')
      .update(rawBody + secret)
      .digest('hex'),
    'md5-secret-then-body': crypto
      .createHash('md5')
      .update(secret + rawBody)
      .digest('hex'),
    'md5-body-then-secret': crypto
      .createHash('md5')
      .update(rawBody + secret)
      .digest('hex'),
  };
  const matchingAlgos = Object.entries(candidates)
    .filter(([, sig]) => sig === sigHeader)
    .map(([name]) => name);

  console.log('%s debug received_sig=%s', LOG_PREFIX, sigHeader);
  console.log('%s debug received_sig_length=%d', LOG_PREFIX, sigHeader.length);
  console.log('%s debug secret_prefix=%s...', LOG_PREFIX, secret.slice(0, 8));
  console.log('%s debug body_length=%d', LOG_PREFIX, rawBody.length);
  console.log('%s debug body_prefix=%s', LOG_PREFIX, rawBody.slice(0, 100));
  console.log(
    '%s debug matching_algos=%s',
    LOG_PREFIX,
    matchingAlgos.length > 0 ? matchingAlgos.join(', ') : 'NONE',
  );
  console.log('%s debug all_computed=%s', LOG_PREFIX, JSON.stringify(candidates));

  // Tant qu'on n'a pas le bon algo, on refuse l'event (pas d'authentification
  // valide = pas de processing). On retentera apres patch.
  // NB : tout le code suivant (parse JSON + idempotence + dispatch) est
  // temporairement supprime pour eviter "unreachable code" + erreurs TS
  // strict. Sera restaure dans le commit qui patche le bon algo.
  console.error('%s invalid-signature (debug-mode-no-auth)', LOG_PREFIX);
  return new NextResponse('Invalid signature (debug)', { status: 400 });
}

// Imports gardes pour le restore post-debug
void handleSellsyEvent;
void getSupabaseServiceClient;
void ({} as SellsyWebhookEvent);
