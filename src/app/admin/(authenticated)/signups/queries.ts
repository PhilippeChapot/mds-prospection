import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SIGNUP_STATUSES, type SignupRow, type SignupStatus } from './types';

interface ListSignupsParams {
  q?: string;
  status?: SignupStatus | null;
  category?: 'partenaire' | 'sponsor' | null;
  poleCode?: string | null;
  dateFrom?: string | null; // ISO yyyy-mm-dd
  dateTo?: string | null;
  page?: number;
  perPage?: number;
}

export interface ListSignupsResult {
  rows: SignupRow[];
  total: number;
}

/**
 * Liste paginee des public_signup_attempts pour /admin/signups.
 *
 * Filtre cote DB :
 *   - status (single)
 *   - category (partenaire|sponsor)
 *   - poleCode : sur ai_classification->>pole_code
 *   - date range sur created_at
 *   - search "or" sur email + company_name_input + contact_first_name +
 *     contact_last_name (ilike %q%)
 *
 * RLS admin only (cf. migration 0019). Sales -> 0 lignes.
 */
export async function listSignups({
  q,
  status,
  category,
  poleCode,
  dateFrom,
  dateTo,
  page = 1,
  perPage = 50,
}: ListSignupsParams): Promise<ListSignupsResult> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('public_signup_attempts')
    .select(
      'id, email, contact_first_name, contact_last_name, company_name_input, category, derived_category, language, status, ai_classification, created_at, verified_at, step2_submitted_at, converted_to_prospect_id, matched_company:companies(external_event_tags)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (category) {
    query = query.eq('category', category);
  }
  if (poleCode) {
    query = query.eq('ai_classification->>pole_code', poleCode);
  }
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
  }
  if (q && q.trim().length > 0) {
    const sanitized = q.trim().replace(/[%_]/g, '');
    if (sanitized.length > 0) {
      // OR sur 4 colonnes — Supabase syntax `or('email.ilike.%X%,company_name_input.ilike.%X%,...')`
      const orClause = [
        `email.ilike.%${sanitized}%`,
        `company_name_input.ilike.%${sanitized}%`,
        `contact_first_name.ilike.%${sanitized}%`,
        `contact_last_name.ilike.%${sanitized}%`,
      ].join(',');
      query = query.or(orClause);
    }
  }

  const offset = Math.max(0, (page - 1) * perPage);
  query = query.range(offset, offset + perPage - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error('[signups/queries] listSignups failed', error);
    return { rows: [], total: 0 };
  }

  const rows: SignupRow[] = (data ?? []).map((r) => {
    const ai = r.ai_classification as {
      pole_code?: string;
      confidence?: number;
      reasoning?: string;
    } | null;
    const matched = Array.isArray(r.matched_company) ? r.matched_company[0] : r.matched_company;
    const externalEventTags =
      matched && typeof matched === 'object' && 'external_event_tags' in matched
        ? ((matched as { external_event_tags: unknown }).external_event_tags as Record<
            string,
            unknown
          > | null)
        : null;
    // Filet de securite : si la status renvoyee n'est pas dans notre enum local,
    // fallback awaiting_verification (pas censee arriver, RLS et enum DB protegent).
    const status = (SIGNUP_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as SignupStatus)
      : 'awaiting_verification';
    return {
      id: r.id,
      email: r.email,
      contactFirstName: r.contact_first_name,
      contactLastName: r.contact_last_name,
      companyNameInput: r.company_name_input,
      category: (r.category as 'partenaire' | 'sponsor' | null) ?? null,
      derivedCategory: r.derived_category,
      language: r.language as 'FR' | 'EN',
      status,
      aiPoleCode: ai?.pole_code ?? null,
      aiConfidence: typeof ai?.confidence === 'number' ? ai.confidence : null,
      aiReasoning: typeof ai?.reasoning === 'string' ? ai.reasoning : null,
      createdAt: r.created_at,
      verifiedAt: r.verified_at,
      step2SubmittedAt: r.step2_submitted_at,
      convertedToProspectId: r.converted_to_prospect_id,
      externalEventTags,
    };
  });

  return { rows, total: count ?? 0 };
}

/**
 * Compteurs par statut pour les filters bar (badges).
 */
export async function countSignupsByStatus(): Promise<Record<SignupStatus, number>> {
  const supabase = await createSupabaseServerClient();
  const init: Record<SignupStatus, number> = {
    awaiting_verification: 0,
    verified: 0,
    step2_started: 0,
    step2_completed: 0,
    converted: 0,
    rejected: 0,
    expired: 0,
  };

  const { data, error } = await supabase.from('public_signup_attempts').select('status');

  if (error || !data) return init;

  for (const row of data) {
    const s = row.status as SignupStatus;
    if (init[s] != null) init[s] += 1;
  }
  return init;
}
