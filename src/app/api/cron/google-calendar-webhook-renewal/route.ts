/**
 * P14.2.SalesCalendarGoogleSync — cron renouvellement webhooks (1×/jour, 3h).
 *
 * Les push channels Google expirent (~7j max). Ce cron ré-enregistre les
 * channels dont l'expiration approche (< 48h) ou est absente, pour les
 * connexions sync_enabled. registerWebhook stoppe l'ancien channel avant
 * d'en créer un neuf.
 *
 * Auth : CRON_SECRET (Bearer) OU header x-vercel-cron.
 */

import { NextResponse } from 'next/server';
import { listTokensForWebhookRenewal } from '@/lib/admin/calendar/google/tokens-store';
import { registerWebhook } from '@/lib/admin/calendar/google/webhook-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RENEW_WINDOW_MS = 48 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const expected = process.env.CRON_SECRET;
  if (cronHeader && expected) return true;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new NextResponse('Unauthorized', { status: 401 });

  const startedAt = Date.now();
  const threshold = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();
  const tokens = await listTokensForWebhookRenewal(threshold);

  const stats = { candidates: tokens.length, renewed: 0, errors: 0 };
  for (const token of tokens) {
    try {
      const r = await registerWebhook(token.user_id);
      if (r.ok) stats.renewed++;
      else stats.errors++;
    } catch (err) {
      stats.errors++;
      console.warn(
        '[google-webhook-renewal] user=%s msg=%s',
        token.user_id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...stats });
}
