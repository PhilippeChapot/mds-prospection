/**
 * P12.x.EmailIntegration — cron sync IMAP (Vercel, toutes les 2 min).
 *
 * Auth : Bearer EMAIL_SYNC_CRON_SECRET OU header x-vercel-cron. Synchronise
 * séquentiellement chaque compte email actif (pagination 50/run côté
 * syncEmailAccount pour rester sous la limite 60s).
 */

import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { syncEmailAccount } from '@/lib/email/imap-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const expected = process.env.EMAIL_SYNC_CRON_SECRET;
  if (cronHeader && expected) return true;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new NextResponse('Unauthorized', { status: 401 });

  const db = getSupabaseServiceClient() as unknown as SupabaseClient;
  const { data: accounts, error } = await db
    .from('email_accounts')
    .select('id')
    .eq('is_active', true);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [];
  for (const a of accounts ?? []) {
    results.push(await syncEmailAccount(db, a.id as string));
  }

  return NextResponse.json({ ok: true, accounts: results.length, results });
}
