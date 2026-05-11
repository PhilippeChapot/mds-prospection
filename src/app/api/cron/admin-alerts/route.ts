/**
 * Cron Vercel — synchronisation des alertes admin pipeline (P5.x.11).
 *
 * Trigger : toutes les heures via vercel.json. Auth via Bearer
 * CRON_SECRET (meme env var que les autres crons).
 *
 * Calcule les 6 kinds d'alertes, UPSERT les actives, auto-resolve celles
 * qui ne matchent plus leur condition.
 *
 * Logs structures (prefix [cron/admin-alerts]).
 */

import { NextResponse } from 'next/server';
import { syncAllAlerts } from '@/lib/dashboard/alerts';

const LOG_PREFIX = '[cron/admin-alerts]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    console.warn('%s unauthorized auth_header_present=%s', LOG_PREFIX, Boolean(auth));
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('%s start', LOG_PREFIX);
  try {
    const result = await syncAllAlerts();
    console.log(
      '%s done inserted=%d resolved=%d errors=%d',
      LOG_PREFIX,
      result.inserted,
      result.resolved,
      result.errors,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
