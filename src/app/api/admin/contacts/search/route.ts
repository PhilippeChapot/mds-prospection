/**
 * GET /api/admin/contacts/search?q=...&company_id=...
 *
 * P5.x.24 — autocomplete combobox contact pour /admin/prospects/new
 * (et tout autre écran admin).
 *
 * Comportement :
 *   - Si `company_id` fourni → filtre les contacts de cette société uniquement.
 *   - Sinon → recherche globale par email/first_name/last_name.
 *
 * Auth : admin | sales.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/contacts/search]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  company_id: z.string().uuid().optional().nullable(),
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
      company_id: url.searchParams.get('company_id'),
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ contacts: [] }, { status: 200 });
    }
    const { q, company_id, limit } = parsed.data;

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from('contacts')
      .select(
        `id, email, first_name, last_name, phone, role, is_primary, language, company_id,
         company:companies!inner(id, name, primary_domain)`,
      )
      .order('is_primary', { ascending: false })
      .order('email', { ascending: true })
      .limit(limit);

    if (company_id) {
      query = query.eq('company_id', company_id);
    }

    if (q && q.length >= 2) {
      const term = `%${q}%`;
      query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('%s db-error msg=%s', LOG_PREFIX, error.message);
      return NextResponse.json({ contacts: [] }, { status: 500 });
    }

    interface ContactRow {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      role: string | null;
      is_primary: boolean;
      language: 'FR' | 'EN';
      company_id: string;
      company:
        | { id: string; name: string; primary_domain: string | null }
        | { id: string; name: string; primary_domain: string | null }[]
        | null;
    }

    const contacts = ((data ?? []) as ContactRow[]).map((r) => {
      const company = Array.isArray(r.company) ? r.company[0] : r.company;
      return {
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        role: r.role,
        is_primary: r.is_primary,
        language: r.language,
        company_id: r.company_id,
        company_name: company?.name ?? '',
        company_primary_domain: company?.primary_domain ?? null,
      };
    });

    return NextResponse.json({ contacts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ contacts: [], error: msg }, { status: 500 });
  }
}
