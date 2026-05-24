/**
 * GET /api/admin/companies/search?q=ALGAM
 *
 * P5.x.24 — autocomplete combobox société sur /admin/prospects/new
 * et autres écrans admin.
 *
 * Auth : admin | sales. Pas pour le public (utiliser /api/public/companies/search).
 *
 * Stratégie :
 *   - Server : filtre permissif via ilike (utilise le GIN trgm index sur
 *     companies.name + name_normalized, actif depuis P5.x.16-bis) + primary_domain.
 *     Limit large (50) pour garder de la marge au ranking.
 *   - JS : ranking déterministe via rankCompanyMatches (startsWith=100,
 *     contains=50, domain=30, fuzzy=10). Tie-breaker alphabétique FR.
 *
 * Réponse : { companies: [{ id, name, primary_domain, alternate_domains }] }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankCompanyMatches } from '@/lib/utils/rank-company';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/companies/search]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      q: url.searchParams.get('q') ?? '',
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ companies: [] }, { status: 200 });
    }
    const { q, limit } = parsed.data;

    const supabase = await createSupabaseServerClient();

    // Filtre serveur : ilike (utilise GIN trgm index) sur name + normalized + domain.
    // Si pas de query, on retourne les 50 premières sociétés ordonnées par nom.
    let query = supabase
      .from('companies')
      .select('id, name, name_normalized, primary_domain, alternate_domains')
      .order('name', { ascending: true })
      .limit(50);

    if (q && q.length >= 1) {
      const term = `%${q}%`;
      query = query.or(
        `name.ilike.${term},name_normalized.ilike.${term},primary_domain.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('%s db-error msg=%s', LOG_PREFIX, error.message);
      return NextResponse.json({ companies: [] }, { status: 500 });
    }

    // Ranking déterministe côté JS sur le sous-ensemble retourné.
    const ranked = rankCompanyMatches(q, data ?? [], limit).map((c) => ({
      id: c.id,
      name: c.name,
      primary_domain: c.primary_domain,
      alternate_domains: (c.alternate_domains as string[] | null) ?? [],
    }));

    return NextResponse.json({ companies: ranked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ companies: [], error: msg }, { status: 500 });
  }
}
