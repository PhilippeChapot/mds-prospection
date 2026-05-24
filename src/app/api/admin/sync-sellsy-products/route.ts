/**
 * Endpoint admin "Re-sync maintenant" — declenche manuellement
 * syncSellsyProducts(). Auth via la session admin Supabase (cookie).
 *
 * Appele depuis /admin/sellsy-products (bouton magenta).
 *
 * Logs structures (prefix [admin/sync-sellsy-products]).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { syncSellsyProducts } from '@/lib/sellsy/sync-products';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/sync-sellsy-products]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    console.log('%s start by=%s', LOG_PREFIX, profile.email);
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
