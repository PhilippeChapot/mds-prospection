/**
 * Cron Vercel — cleanup des verrous d'emission devis Sellsy expires.
 *
 * P4.x.2 sujet H' : si un crash mid-flight de runCaseAFlowLocked empeche
 * le release du lock dans le finally, le prospect serait bloque jusqu'a
 * l'expiration du TTL (5min). Ce cron tourne toutes les 10 minutes pour :
 *   - DELETE les locks dont expires_at < now() (TTL passé)
 *   - Logger combien ont ete supprimes
 *
 * Schedule : configure dans vercel.json (toutes les 10 min). Auth via
 * header Bearer CRON_SECRET (meme env var que le cron sync-sellsy-products).
 *
 * Logs structures (prefix [cron/cleanup-emit-locks]).
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[cron/cleanup-emit-locks]';

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
    const supabase = getSupabaseServiceClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('sellsy_emit_locks')
      .delete()
      .lt('expires_at', nowIso)
      .select('prospect_id');

    if (error) {
      console.error('%s db-error msg=%s', LOG_PREFIX, error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const count = data?.length ?? 0;
    console.log('%s done deleted=%d', LOG_PREFIX, count);
    return NextResponse.json({ ok: true, deleted: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
