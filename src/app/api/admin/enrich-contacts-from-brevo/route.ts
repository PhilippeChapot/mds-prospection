/**
 * Endpoint admin — enrichit les sociétés orphelines en matchant leurs domains
 * contre la base Brevo (P5.x.21).
 *
 * Auth : session admin (admin only, pas sales — opération coûteuse + altère
 * la base contacts à grande échelle).
 *
 * Query params (tous optionnels) :
 *   ?maxEnrichments=<int>  Garde-fou (default 500, max 1000)
 *   ?maxPages=<int>        Garde-fou pagination (default 100)
 *   ?listId=<int>          Restreint à une liste Brevo unique
 *
 * Réponse : { ok, orphansWithDomain, brevoTotalScanned, domainsMatched,
 *             contactsCreated, domainsNoMatch, errors, durationSeconds }.
 *
 * Logs structurés (prefix [admin/enrich-contacts-from-brevo]).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { enrichOrphanCompaniesFromBrevo } from '@/lib/contacts/brevo-enrich';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/enrich-contacts-from-brevo]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role)) {
      return new NextResponse('Forbidden — admin only', { status: 403 });
    }

    const url = new URL(req.url);
    const maxEnrichmentsRaw = url.searchParams.get('maxEnrichments');
    const maxEnrichments = maxEnrichmentsRaw
      ? Math.max(1, Math.min(1000, Number.parseInt(maxEnrichmentsRaw, 10)))
      : 500;
    const maxPagesRaw = url.searchParams.get('maxPages');
    const maxPages = maxPagesRaw
      ? Math.max(1, Math.min(200, Number.parseInt(maxPagesRaw, 10)))
      : 100;
    const listIdRaw = url.searchParams.get('listId');
    const listIds = listIdRaw
      ? [Number.parseInt(listIdRaw, 10)].filter((n) => Number.isFinite(n))
      : undefined;

    console.log(
      '%s start by=%s maxEnrich=%d maxPages=%d listIds=%s',
      LOG_PREFIX,
      profile.email,
      maxEnrichments,
      maxPages,
      listIds ? listIds.join(',') : 'all',
    );

    const result = await enrichOrphanCompaniesFromBrevo({
      maxEnrichments,
      maxPages,
      listIds,
    });

    console.log(
      '%s done orphans=%d scanned=%d matched=%d created=%d errors=%d duration=%ds',
      LOG_PREFIX,
      result.orphansWithDomain,
      result.brevoTotalScanned,
      result.domainsMatched,
      result.contactsCreated,
      result.errors,
      result.durationSeconds,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
