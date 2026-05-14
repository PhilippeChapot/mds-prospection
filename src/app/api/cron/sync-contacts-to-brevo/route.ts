/**
 * Cron Vercel quotidien — push DB → Brevo (batch limité).
 *
 * Schedule : 30 6 * * * (= 6h30 UTC = 8h30 Paris été / 7h30 hiver) — décalé
 * de 30 min après sync Sellsy pour ne pas surcharger.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` envoyé par Vercel.
 *
 * Batch limité à 200 contacts/jour — couvre les nouveaux contacts ajoutés
 * via Espace Exposant sans saturer la quota Brevo si la base grossit.
 *
 * Logs structurés (prefix [cron/sync-contacts-to-brevo]).
 */

import { NextResponse } from 'next/server';
import { syncContactsToBrevo } from '@/lib/contacts/brevo-sync';

const LOG_PREFIX = '[cron/sync-contacts-to-brevo]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    console.warn('%s unauthorized auth_header_present=%s', LOG_PREFIX, Boolean(auth));
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('%s start', LOG_PREFIX);
  try {
    const result = await syncContactsToBrevo({ limit: 200 });
    console.log(
      '%s done attempted=%d created=%d linked=%d failed=%d',
      LOG_PREFIX,
      result.attempted,
      result.created,
      result.linked,
      result.failed,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
