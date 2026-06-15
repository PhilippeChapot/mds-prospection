'use server';

/**
 * P15.1.VisitorModel — lecture des visiteurs (liste + fiche).
 *
 * Accès DB via le client service-role (la table `visitors` n'expose qu'une
 * policy RLS `service_role`). La garde `requireAdminProfile()` reste la
 * défense d'accès (defense-in-depth, comme la fiche prospect).
 */

import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { VisitorListItem } from '@/lib/visitors/constants';

const VISITOR_LIST_SELECT = `
  id, pole, visitor_type, is_vip, source, status, language, is_big_company,
  brevo_synced_at, notes, created_at,
  contact:contacts!visitors_contact_id_fkey(id, first_name, last_name, email, phone_mobile),
  company:companies(id, name, website),
  owner:users!visitors_owner_user_id_fkey(id, full_name, email)
` as const;

export type ListVisitorsInput = {
  query?: string;
  pole?: string | null;
  status?: string | null;
  visitorType?: string | null;
  isVip?: boolean | null;
  language?: string | null;
  page?: number;
  perPage?: number;
};

export type ListVisitorsResult = {
  rows: VisitorListItem[];
  total: number;
  page: number;
  perPage: number;
};

/** Normalise une jointure 1-1 PostgREST (objet ou tableau) en objet|null. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function listVisitorsAction(
  input: ListVisitorsInput = {},
): Promise<ListVisitorsResult> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(200, Math.max(1, input.perPage ?? 50));

  // Recherche texte : on résout d'abord les contact_ids correspondants
  // (filtrage fiable côté table parent plutôt qu'un .or() sur foreignTable).
  let contactIdFilter: string[] | null = null;
  const q = input.query?.trim() ?? '';
  if (q.length >= 2) {
    const pattern = `%${q}%`;
    const { data: matched } = await supabase
      .from('contacts')
      .select('id')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(500);
    contactIdFilter = (matched ?? []).map((c) => c.id);
    if (contactIdFilter.length === 0) {
      return { rows: [], total: 0, page, perPage };
    }
  }

  let query = supabase
    .from('visitors')
    .select(VISITOR_LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (input.pole) query = query.eq('pole', input.pole);
  if (input.status) query = query.eq('status', input.status);
  if (input.visitorType) query = query.eq('visitor_type', input.visitorType);
  if (input.isVip != null) query = query.eq('is_vip', input.isVip);
  if (input.language) query = query.eq('language', input.language);
  if (contactIdFilter) query = query.in('contact_id', contactIdFilter);

  query = query.range((page - 1) * perPage, page * perPage - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`listVisitorsAction failed: ${error.message}`);

  const rows: VisitorListItem[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      pole: (row.pole as string | null) ?? null,
      visitor_type: (row.visitor_type as string | null) ?? null,
      is_vip: Boolean(row.is_vip),
      source: row.source as string,
      status: row.status as string,
      language: row.language as string,
      is_big_company: Boolean(row.is_big_company),
      brevo_synced_at: (row.brevo_synced_at as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      created_at: row.created_at as string,
      contact: one(row.contact as VisitorListItem['contact']),
      company: one(row.company as VisitorListItem['company']),
      owner: one(row.owner as VisitorListItem['owner']),
    };
  });

  return { rows, total: count ?? 0, page, perPage };
}

export type VisitorStats = { total: number; vip: number; confirmed: number };

export async function getVisitorStatsAction(): Promise<VisitorStats> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const [{ count: total }, { count: vip }, { count: confirmed }] = await Promise.all([
    supabase.from('visitors').select('id', { count: 'exact', head: true }),
    supabase.from('visitors').select('id', { count: 'exact', head: true }).eq('is_vip', true),
    supabase
      .from('visitors')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed'),
  ]);

  return { total: total ?? 0, vip: vip ?? 0, confirmed: confirmed ?? 0 };
}

export async function getVisitorByIdAction(visitorId: string) {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('visitors')
    .select(
      `
      *,
      contact:contacts!visitors_contact_id_fkey(*),
      company:companies(*),
      owner:users!visitors_owner_user_id_fkey(id, full_name, email),
      invitation_data:visitor_invitation_data(*),
      visitor_account:visitor_accounts(id, email, password_set_at, last_login_at)
    `,
    )
    .eq('id', visitorId)
    .maybeSingle();

  if (error) throw new Error(`getVisitorByIdAction failed: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    ...row,
    contact: one(row.contact),
    company: one(row.company),
    owner: one(row.owner),
    invitation_data: one(row.invitation_data),
    visitor_account: one(row.visitor_account),
  };
}
