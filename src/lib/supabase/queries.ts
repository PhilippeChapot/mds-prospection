/**
 * Helpers de requete reutilisables.
 * Tous fonctionnent en SSR (server components / server actions) avec
 * createSupabaseServerClient — donc RLS appliquee en fonction du user
 * connecte (admin = tout, sales = ses prospects).
 *
 * Les types et constantes "safe pour client" sont dans ./constants.ts
 * (re-exportes ici pour retro-compatibilite). Ce fichier importe
 * `next/headers` via createSupabaseServerClient -> ne PAS importer
 * depuis un Client Component.
 */
import { createSupabaseServerClient } from './server';
import type { Database } from './database.types';
import {
  PIPELINE_ORDER,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABEL_FR,
  PROSPECT_STATUS_LABEL_EN,
  PACK_CODES,
  PACK_LABEL,
  type ProspectStatus,
  type PackCode,
  type CategoryTarif,
  type ProspectListItem,
  type CompanyListItem,
} from './constants';

export {
  PIPELINE_ORDER,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABEL_FR,
  PROSPECT_STATUS_LABEL_EN,
  PACK_CODES,
  PACK_LABEL,
  type ProspectStatus,
  type PackCode,
  type CategoryTarif,
  type ProspectListItem,
  type CompanyListItem,
};

const PROSPECT_LIST_SELECT = `
  id, status, pack_code, estimated_amount, owner_id, affiliate_id, is_test, created_at, last_activity_at,
  company:companies!inner(id, name, category, was_prs_2026_exhibitor, external_event_tags, phone, pole:poles(code, name_fr)),
  contact:contacts(id, first_name, last_name, email, phone_mobile),
  owner:users!prospects_owner_id_fkey(id, full_name, email)
`;

/**
 * Liste paginee + filtres URL + search.
 * Le search fait un lookup en 2 etapes : on resout d'abord les company_id qui
 * matchent le nom (ILIKE), puis on filtre prospects.company_id IN (...).
 */
export async function listProspectsPaginated(opts: {
  q?: string;
  status?: ProspectStatus | null;
  poleCode?: string | null;
  ownerId?: string | null;
  page?: number;
  perPage?: number;
  sort?: 'created_at' | 'last_activity_at' | 'estimated_amount';
  dir?: 'asc' | 'desc';
}): Promise<{ rows: ProspectListItem[]; total: number; page: number; perPage: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = opts.sort ?? 'last_activity_at';
  const dir = opts.dir ?? 'desc';

  // 1. Resoudre les company_ids qui matchent la recherche (si query non vide)
  let companyIdsFilter: string[] | null = null;
  if (opts.q && opts.q.trim().length >= 2) {
    const term = `%${opts.q.trim()}%`;
    const { data: matchedCompanies } = await supabase
      .from('companies')
      .select('id')
      .or(`name.ilike.${term},primary_domain.ilike.${term}`)
      .limit(200);
    companyIdsFilter = (matchedCompanies ?? []).map((c) => c.id);
    if (companyIdsFilter.length === 0) {
      return { rows: [], total: 0, page, perPage };
    }
  }

  // 2. Resoudre le pole_id si filtre pole code
  let poleIdFilter: string | null = null;
  if (opts.poleCode) {
    const { data: poleRow } = await supabase
      .from('poles')
      .select('id')
      .eq('code', opts.poleCode as Database['public']['Enums']['pole_code'])
      .maybeSingle();
    poleIdFilter = poleRow?.id ?? null;
  }

  // 3. Construire la requete principale
  let query = supabase
    .from('prospects')
    .select(PROSPECT_LIST_SELECT, { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to);

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.ownerId) query = query.eq('owner_id', opts.ownerId);
  if (companyIdsFilter) query = query.in('company_id', companyIdsFilter);
  if (poleIdFilter) {
    // Filter via the joined company.pole_id — postgrest syntax
    query = query.eq('company.pole_id', poleIdFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[queries.listProspectsPaginated]', error);
    return { rows: [], total: 0, page, perPage };
  }

  // Normalise les relations (postgrest peut retourner array ou objet).
  // Cast `as never` minimal : phone_mobile / companies.phone via migration
  // 0083 pas encore regen dans les types Supabase generated.
  const rows = (data ?? []).map((row) => normalizeProspectRow(row as never)) as ProspectListItem[];
  return { rows, total: count ?? 0, page, perPage };
}

/**
 * Liste paginee des companies + filtres (pole, categorie, pays, search).
 */
export async function listCompaniesPaginated(opts: {
  q?: string;
  poleCode?: string | null;
  category?: CategoryTarif | null;
  country?: string | null;
  /** P5.x.CompaniesAddressAndTags : filtre toggle adresse complete / manquante. */
  missingAddress?: boolean | null;
  /** P5.x.ProspectionIndicators : masquer sociétés déjà prospectées. */
  hideProspected?: boolean | null;
  page?: number;
  perPage?: number;
}): Promise<{ rows: CompanyListItem[]; total: number; page: number; perPage: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Resolve pole_id si filtre par code
  let poleIdFilter: string | null = null;
  if (opts.poleCode) {
    const { data: poleRow } = await supabase
      .from('poles')
      .select('id')
      .eq('code', opts.poleCode as Database['public']['Enums']['pole_code'])
      .maybeSingle();
    poleIdFilter = poleRow?.id ?? null;
  }

  // P5.x.ProspectionIndicators — pre-query prospected company IDs for hideProspected filter
  let prospectedCompanyIdsAll: Set<string> | null = null;
  if (opts.hideProspected === true) {
    const { data: prospectData } = await supabase.from('prospects').select('primary_contact_id');
    const prospectContactIds = (
      (prospectData ?? []) as Array<{ primary_contact_id: string | null }>
    )
      .map((p) => p.primary_contact_id)
      .filter(Boolean) as string[];
    prospectedCompanyIdsAll = new Set<string>();
    if (prospectContactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('company_id')
        .in('id', prospectContactIds);
      for (const c of (contactData ?? []) as Array<{ company_id: string | null }>) {
        if (c.company_id) prospectedCompanyIdsAll.add(c.company_id);
      }
    }
  }

  let query = supabase
    .from('companies')
    .select(
      'id, name, primary_domain, country, category, was_prs_2026_exhibitor, external_event_tags, raw_address, city, postal_code, website, created_at, pole:poles(code, name_fr)',
      { count: 'exact' },
    )
    .order('name', { ascending: true })
    .range(from, to);

  if (opts.q && opts.q.trim().length >= 2) {
    const term = `%${opts.q.trim()}%`;
    // P5.x.CompaniesAddressAndTags : recherche etendue a city.
    query = query.or(`name.ilike.${term},primary_domain.ilike.${term},city.ilike.${term}`);
  }
  if (poleIdFilter) query = query.eq('pole_id', poleIdFilter);
  if (opts.category) query = query.eq('category', opts.category);
  if (opts.country) query = query.eq('country', opts.country.toUpperCase());
  if (opts.missingAddress === true) {
    // Adresse manquante = city OR postal_code IS NULL/empty.
    query = query.or('city.is.null,postal_code.is.null');
  } else if (opts.missingAddress === false) {
    query = query.not('city', 'is', null).not('postal_code', 'is', null);
  }
  if (opts.hideProspected === true && prospectedCompanyIdsAll && prospectedCompanyIdsAll.size > 0) {
    query = query.not('id', 'in', `(${[...prospectedCompanyIdsAll].join(',')})`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[queries.listCompaniesPaginated]', error);
    return { rows: [], total: 0, page, perPage };
  }

  // P5.x.ProspectionIndicators — post-enrich with has_prospected_contact
  const baseCompanyIds = (data ?? []).map((r) => r.id);
  let prospectedIdsForPage: Set<string>;
  if (prospectedCompanyIdsAll !== null) {
    // Reuse pre-query data (hideProspected path)
    prospectedIdsForPage = prospectedCompanyIdsAll;
  } else if (baseCompanyIds.length > 0) {
    const { data: contactsForPage } = await supabase
      .from('contacts')
      .select('id, company_id')
      .in('company_id', baseCompanyIds);
    const contactIdsForPage = (
      (contactsForPage ?? []) as Array<{ id: string; company_id: string | null }>
    ).map((c) => c.id);
    prospectedIdsForPage = new Set<string>();
    if (contactIdsForPage.length > 0) {
      const { data: prospectRows } = await supabase
        .from('prospects')
        .select('primary_contact_id')
        .in('primary_contact_id', contactIdsForPage);
      const prospectedContactIds = new Set(
        ((prospectRows ?? []) as Array<{ primary_contact_id: string }>).map(
          (p) => p.primary_contact_id,
        ),
      );
      for (const c of (contactsForPage ?? []) as Array<{ id: string; company_id: string | null }>) {
        if (prospectedContactIds.has(c.id) && c.company_id) prospectedIdsForPage.add(c.company_id);
      }
    }
  } else {
    prospectedIdsForPage = new Set<string>();
  }

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    primary_domain: row.primary_domain,
    country: row.country,
    category: row.category,
    was_prs_2026_exhibitor: row.was_prs_2026_exhibitor,
    external_event_tags: (row.external_event_tags ?? {}) as Record<string, unknown>,
    // P5.x.CompaniesAddressAndTags
    raw_address: (row as { raw_address?: string | null }).raw_address ?? null,
    city: (row as { city?: string | null }).city ?? null,
    postal_code: (row as { postal_code?: string | null }).postal_code ?? null,
    website: (row as { website?: string | null }).website ?? null,
    created_at: row.created_at,
    pole: pickFirst(row.pole),
    has_prospected_contact: prospectedIdsForPage.has(row.id),
  }));

  return { rows, total: count ?? 0, page, perPage };
}

/**
 * Liste les pays distincts presents en DB (pour le select filtre).
 */
export async function listDistinctCountries(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('companies')
    .select('country')
    .not('country', 'is', null)
    .order('country', { ascending: true });
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.country) set.add(row.country);
  }
  return [...set];
}

/**
 * Recherche simple par nom (auto-complete combobox creation prospect).
 */
export async function searchCompaniesByName(query: string, limit = 10) {
  if (query.trim().length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const term = `%${query.trim()}%`;
  const { data } = await supabase
    .from('companies')
    .select('id, name, primary_domain, category, pole:poles(code, name_fr)')
    .or(`name.ilike.${term},primary_domain.ilike.${term}`)
    .order('name', { ascending: true })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    primary_domain: row.primary_domain,
    category: row.category,
    pole: pickFirst(row.pole),
  }));
}

/* ---------------------- helpers internes ---------------------- */

type MaybeArray<T> = T | T[] | null;

function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type RawProspectRow = {
  id: string;
  status: ProspectStatus;
  pack_code: PackCode;
  estimated_amount: number | null;
  owner_id: string | null;
  affiliate_id: string | null;
  is_test: boolean;
  created_at: string;
  last_activity_at: string;
  company: MaybeArray<{
    id: string;
    name: string;
    category: CategoryTarif;
    was_prs_2026_exhibitor: boolean;
    external_event_tags: unknown;
    phone: string | null;
    pole: MaybeArray<{ code: string; name_fr: string }>;
  }>;
  contact: MaybeArray<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_mobile: string | null;
  }>;
  owner: MaybeArray<{ id: string; full_name: string | null; email: string }>;
};

function normalizeProspectRow(row: RawProspectRow): ProspectListItem {
  const company = pickFirst(row.company);
  return {
    id: row.id,
    status: row.status,
    pack_code: row.pack_code,
    estimated_amount: row.estimated_amount,
    owner_id: row.owner_id,
    affiliate_id: row.affiliate_id,
    is_test: row.is_test,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    company: company
      ? {
          id: company.id,
          name: company.name,
          category: company.category,
          was_prs_2026_exhibitor: company.was_prs_2026_exhibitor,
          external_event_tags: (company.external_event_tags ?? {}) as Record<string, unknown>,
          phone: company.phone ?? null,
          pole: pickFirst(company.pole),
        }
      : null,
    contact: pickFirst(row.contact),
    owner: pickFirst(row.owner),
  };
}
