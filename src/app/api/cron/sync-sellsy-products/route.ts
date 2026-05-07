/**
 * Cron Vercel quotidien — sync produits Sellsy.
 *
 * Schedule : 0 6 * * * (= 6h UTC = 7h Paris ete / 8h hiver). Configure dans
 * vercel.json (clé "crons").
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}`. Vercel cron envoie
 * automatiquement ce header s'il est configure dans le dashboard, OU l'admin
 * peut le mettre en env var pour test manuel via curl.
 *
 * Logs structures (prefix [cron/sync-sellsy-products]).
 */

import { NextResponse } from 'next/server';
import { syncSellsyProducts } from '@/lib/sellsy/sync-products';

const LOG_PREFIX = '[cron/sync-sellsy-products]';

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
    const result = await syncSellsyProducts();
    console.log(
      '%s done synced=%d auto_mapped=%d archived=%d errors=%d',
      LOG_PREFIX,
      result.synced,
      result.autoMapped,
      result.archived,
      result.errors.length,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
