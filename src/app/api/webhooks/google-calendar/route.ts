/**
 * P14.2.SalesCalendarGoogleSync — webhook PULL (Google → MDS).
 *
 * Google POST une notification à chaque changement sur le calendrier watché.
 * Headers Google (pas de body utile) :
 *   - X-Goog-Channel-ID       : notre channel_id.
 *   - X-Goog-Resource-ID      : id ressource Google.
 *   - X-Goog-Resource-State   : 'sync' (handshake initial) | 'exists' (change).
 *   - X-Goog-Channel-Token    : notre secret de validation (anti-spoof).
 *
 * Sécurité : on résout le channel_id → user + webhook_token stocké, puis on
 * compare le token reçu (timingSafeEqual). Mismatch → 200 silencieux (ne pas
 * révéler, ne pas retenter — Google retente sinon).
 *
 * On répond 200 vite ; la sync incrémentale tourne avant la réponse (Vercel
 * functions : pas de vrai background après res, donc on await — la sync
 * incrémentale est rapide).
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getOAuthTokenByChannel } from '@/lib/admin/calendar/google/tokens-store';
import { syncEventsFromGoogle } from '@/lib/admin/calendar/google/pull-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[google/webhook-pull]';

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const channelId = req.headers.get('x-goog-channel-id');
  const resourceState = req.headers.get('x-goog-resource-state');
  const channelToken = req.headers.get('x-goog-channel-token');

  // Toujours 200 si on ne peut pas identifier le channel (évite les retries
  // Google sur du bruit, ne révèle rien).
  if (!channelId) {
    return NextResponse.json({ ok: true, ignored: 'no_channel' });
  }

  const token = await getOAuthTokenByChannel(channelId);
  if (!token) {
    console.warn('%s unknown-channel id=%s', LOG_PREFIX, channelId);
    return NextResponse.json({ ok: true, ignored: 'unknown_channel' });
  }

  // Validation du token (anti-spoof).
  const expected = token.webhook_token ?? '';
  const a = Buffer.from(channelToken ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  const valid = expected.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    console.warn('%s invalid-token channel=%s', LOG_PREFIX, channelId);
    return NextResponse.json({ ok: true, ignored: 'invalid_token' });
  }

  // Handshake initial 'sync' : pas de changement, juste un ACK.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true, handshake: true });
  }

  // Changement → sync incrémentale.
  try {
    const stats = await syncEventsFromGoogle(token.user_id);
    return NextResponse.json({ ...stats });
  } catch (err) {
    console.error(
      '%s sync-failed user=%s msg=%s',
      LOG_PREFIX,
      token.user_id,
      err instanceof Error ? err.message : String(err),
    );
    // 200 quand même : Google retenterait sinon, alors que le retry cron
    // gère déjà la reprise.
    return NextResponse.json({ ok: false });
  }
}
