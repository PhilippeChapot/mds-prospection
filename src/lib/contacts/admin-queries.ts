/**
 * P5.x.22 — queries server-side pour /admin/contacts et la section
 * "Contacts" sur fiche société / fiche prospect.
 *
 * Toutes les queries utilisent le client serveur (RLS appliqué pour sales,
 * bypass pour service-role côté actions seulement).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type ContactListFilters = {
  q?: string;
  companyId?: string | null;
  poleCode?: string | null;
  language?: 'FR' | 'EN' | null;
  brevoSync?: 'synced' | 'unsynced' | null;
  lifecycle?: 'enabled' | 'disabled' | null;
  marketing?: 'opted_in' | 'opted_out' | null;
  page?: number;
  perPage?: number;
};

export type ContactListRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_mobile: string | null;
  role: string | null;
  is_primary: boolean;
  language: 'FR' | 'EN';
  marketing_consent: boolean;
  lifecycle_emails_enabled: boolean;
  email_deliverability_status: Database['public']['Enums']['email_deliverability_status'];
  brevo_contact_id: string | null;
  last_synced_brevo_at: string | null;
  created_at: string;
  company: {
    id: string;
    name: string;
    pole_code: string | null;
    phone: string | null;
  };
};

export type ContactsKpis = {
  total: number;
  primary: number;
  brevoSynced: number;
  marketingOptIn: number;
  lifecycleEnabled: number;
  withoutEmail: number;
};

export async function listContactsPaginated(
  filters: ContactListFilters,
): Promise<{ rows: ContactListRow[]; total: number; page: number; perPage: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.perPage ?? 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let poleIdFilter: string | null = null;
  if (filters.poleCode) {
    const { data: poleRow } = await supabase
      .from('poles')
      .select('id')
      .eq('code', filters.poleCode as Database['public']['Enums']['pole_code'])
      .maybeSingle();
    poleIdFilter = poleRow?.id ?? null;
  }

  let query = supabase
    .from('contacts')
    .select(
      `id, email, first_name, last_name, phone, phone_mobile, role, is_primary, language,
       marketing_consent, lifecycle_emails_enabled, email_deliverability_status,
       brevo_contact_id, last_synced_brevo_at, created_at,
       company:companies!inner(id, name, pole_id, phone, pole:poles(code))`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.q && filters.q.trim().length >= 2) {
    const term = `%${filters.q.trim()}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
  }
  if (filters.companyId) query = query.eq('company_id', filters.companyId);
  if (filters.language) query = query.eq('language', filters.language);
  if (filters.brevoSync === 'synced') query = query.not('brevo_contact_id', 'is', null);
  if (filters.brevoSync === 'unsynced') query = query.is('brevo_contact_id', null);
  if (filters.lifecycle === 'enabled') query = query.eq('lifecycle_emails_enabled', true);
  if (filters.lifecycle === 'disabled') query = query.eq('lifecycle_emails_enabled', false);
  if (filters.marketing === 'opted_in') query = query.eq('marketing_consent', true);
  if (filters.marketing === 'opted_out') query = query.eq('marketing_consent', false);
  if (poleIdFilter) query = query.eq('company.pole_id', poleIdFilter);

  const { data, error, count } = await query;
  if (error) {
    console.error('[admin-queries.listContactsPaginated]', error);
    return { rows: [], total: 0, page, perPage };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: ContactListRow[] = ((data ?? []) as any[]).map((r: any) => {
    const company = pickFirst(r.company);
    const pole = pickFirst(company?.pole);
    return {
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      phone: r.phone,
      phone_mobile: (r as { phone_mobile?: string | null }).phone_mobile ?? null,
      role: r.role,
      is_primary: r.is_primary,
      language: r.language,
      marketing_consent: r.marketing_consent,
      lifecycle_emails_enabled: r.lifecycle_emails_enabled,
      email_deliverability_status: r.email_deliverability_status,
      brevo_contact_id: r.brevo_contact_id,
      last_synced_brevo_at: r.last_synced_brevo_at,
      created_at: r.created_at,
      company: {
        id: company?.id ?? '',
        name: company?.name ?? '',
        pole_code: pole?.code ?? null,
        phone: (company as { phone?: string | null } | null)?.phone ?? null,
      },
    };
  });

  return { rows, total: count ?? 0, page, perPage };
}

export async function getContactsKpis(): Promise<ContactsKpis> {
  const supabase = await createSupabaseServerClient();

  const [total, primary, brevoSynced, marketingOptIn, lifecycleEnabled, withoutEmail] =
    await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('is_primary', true),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .not('brevo_contact_id', 'is', null),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('marketing_consent', true),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('lifecycle_emails_enabled', true),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('email', ''),
    ]);

  return {
    total: total.count ?? 0,
    primary: primary.count ?? 0,
    brevoSynced: brevoSynced.count ?? 0,
    marketingOptIn: marketingOptIn.count ?? 0,
    lifecycleEnabled: lifecycleEnabled.count ?? 0,
    withoutEmail: withoutEmail.count ?? 0,
  };
}

export type CompanyContactRow = {
  id: string;
  company_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  language: 'FR' | 'EN';
  marketing_consent: boolean;
  lifecycle_emails_enabled: boolean;
  email_deliverability_status: Database['public']['Enums']['email_deliverability_status'];
  brevo_contact_id: string | null;
  last_synced_brevo_at: string | null;
  created_at: string;
  /** P8.1 — counts pour la colonne "Préférences" (calcules cote query). */
  prefs_active_count: number;
  prefs_locked_count: number;
  prefs_unsubscribed: boolean;
};

export async function listContactsForCompany(companyId: string): Promise<CompanyContactRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .select(
      `id, company_id, email, first_name, last_name, phone, role, is_primary, language,
       marketing_consent, lifecycle_emails_enabled, email_deliverability_status,
       brevo_contact_id, last_synced_brevo_at, created_at,
       preferences:contact_preferences(
         pref_general, pref_exposant, pref_facturation, pref_kit_media,
         pref_administration, pref_partenariat, pref_post_event,
         general_locked_by_admin, exposant_locked_by_admin, facturation_locked_by_admin,
         kit_media_locked_by_admin, administration_locked_by_admin,
         partenariat_locked_by_admin, post_event_locked_by_admin,
         unsubscribed_all_at
       )`,
    )
    .eq('company_id', companyId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[admin-queries.listContactsForCompany]', error);
    return [];
  }

  type RawPrefs = {
    pref_general: boolean;
    pref_exposant: boolean;
    pref_facturation: boolean;
    pref_kit_media: boolean;
    pref_administration: boolean;
    pref_partenariat: boolean;
    pref_post_event: boolean;
    general_locked_by_admin: boolean;
    exposant_locked_by_admin: boolean;
    facturation_locked_by_admin: boolean;
    kit_media_locked_by_admin: boolean;
    administration_locked_by_admin: boolean;
    partenariat_locked_by_admin: boolean;
    post_event_locked_by_admin: boolean;
    unsubscribed_all_at: string | null;
  };

  return (data ?? []).map((r) => {
    const prefs = (
      Array.isArray(r.preferences) ? r.preferences[0] : r.preferences
    ) as RawPrefs | null;
    let activeCount = 0;
    let lockedCount = 0;
    if (prefs) {
      const prefKeys: Array<keyof RawPrefs> = [
        'pref_general',
        'pref_exposant',
        'pref_facturation',
        'pref_kit_media',
        'pref_administration',
        'pref_partenariat',
        'pref_post_event',
      ];
      const lockKeys: Array<keyof RawPrefs> = [
        'general_locked_by_admin',
        'exposant_locked_by_admin',
        'facturation_locked_by_admin',
        'kit_media_locked_by_admin',
        'administration_locked_by_admin',
        'partenariat_locked_by_admin',
        'post_event_locked_by_admin',
      ];
      activeCount = prefKeys.filter((k) => prefs[k] === true).length;
      lockedCount = lockKeys.filter((k) => prefs[k] === true).length;
    }
    const { preferences: _omit, ...rest } = r as typeof r & { preferences: unknown };
    void _omit;
    return {
      ...rest,
      prefs_active_count: activeCount,
      prefs_locked_count: lockedCount,
      prefs_unsubscribed: Boolean(prefs?.unsubscribed_all_at),
    } as CompanyContactRow;
  });
}

type MaybeArray<T> = T | T[] | null | undefined;
function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
