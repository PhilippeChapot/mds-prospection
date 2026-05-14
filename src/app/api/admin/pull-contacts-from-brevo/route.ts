/**
 * Endpoint admin — pull contacts depuis Brevo vers DB (one-shot).
 *
 * Auth : session admin/sales (cookie Supabase).
 *
 * Query params :
 *   ?listId=<int>            (default = BREVO_LIST_PROSPECTION_STANDARD_ID)
 *   ?maxPages=<int>          (default 20, max 100)
 *   ?createMissing=true|false (default false — n'insère pas de company placeholder)
 *
 * Réponse : { ok, fetched, linked, created, skippedNoCompany, skippedNoEmail, failed, errors[] }.
 *
 * Logs structurés (prefix [admin/pull-contacts-from-brevo]).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { pullContactsFromBrevo } from '@/lib/contacts/brevo-pull';

const LOG_PREFIX = '[admin/pull-contacts-from-brevo]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (profile.role !== 'admin') {
      return new NextResponse('Forbidden — admin only for pull', { status: 403 });
    }

    const url = new URL(req.url);
    const listIdRaw = url.searchParams.get('listId');
    const maxPagesRaw = url.searchParams.get('maxPages');
    const createMissingRaw = url.searchParams.get('createMissing');

    const listId = listIdRaw ? Number.parseInt(listIdRaw, 10) : undefined;
    const maxPages = maxPagesRaw
      ? Math.max(1, Math.min(100, Number.parseInt(maxPagesRaw, 10)))
      : 20;
    const createMissingCompanies = createMissingRaw === 'true';

    console.log(
      '%s start by=%s listId=%s maxPages=%d createMissing=%s',
      LOG_PREFIX,
      profile.email,
      listId ?? 'default',
      maxPages,
      createMissingCompanies,
    );
    const result = await pullContactsFromBrevo({ listId, maxPages, createMissingCompanies });
    console.log(
      '%s done fetched=%d linked=%d created=%d skippedNoCompany=%d skippedNoEmail=%d failed=%d',
      LOG_PREFIX,
      result.fetched,
      result.linked,
      result.created,
      result.skippedNoCompany,
      result.skippedNoEmail,
      result.failed,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
