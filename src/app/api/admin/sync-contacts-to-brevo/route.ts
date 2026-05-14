/**
 * Endpoint admin — pousse un batch de contacts DB vers Brevo.
 *
 * Auth : session admin/sales (cookie Supabase).
 *
 * Query params :
 *   ?limit=100   (default 100, max 500)
 *
 * Réponse : { ok, attempted, created, linked, failed, errors[] }.
 *
 * Logs structurés (prefix [admin/sync-contacts-to-brevo]).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { syncContactsToBrevo } from '@/lib/contacts/brevo-sync';

const LOG_PREFIX = '[admin/sync-contacts-to-brevo]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (profile.role !== 'admin' && profile.role !== 'sales') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Math.max(1, Math.min(500, Number.parseInt(limitRaw, 10))) : 100;

    console.log('%s start by=%s limit=%d', LOG_PREFIX, profile.email, limit);
    const result = await syncContactsToBrevo({ limit });
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
