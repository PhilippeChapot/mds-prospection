/**
 * GET /api/public/companies/search?q=<string>
 *
 * Autocomplete societe pour le formulaire d'inscription publique (etape 1).
 * Expose UNIQUEMENT { id, name } d'un sous-ensemble de companies — aucune
 * donnee sensible (pas de domain, pas de country, pas de notes).
 *
 * Auth : aucune (endpoint public).
 * Rate limit : 30 / IP / minute (cf. lib/rate-limit/in-memory.ts).
 *
 * Reponses :
 *   200 { results: [{ id, name }] }   -- max 10
 *   400 { error: 'invalid_query' }    -- q manquant ou trop court
 *   429 { error: 'rate_limited', retryAfter }
 */
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit({
    key: `companies-search:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }

  // Echappe les wildcards SQL pour eviter de matcher trop large.
  const sanitized = q.replace(/[%_]/g, '');
  if (sanitized.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${sanitized}%`)
    .order('name', { ascending: true })
    .limit(MAX_RESULTS);

  if (error) {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}
