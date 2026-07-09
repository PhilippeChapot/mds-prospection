'use server';

/**
 * Export CSV contacts — reserve super_admin (PII : email/tel/LinkedIn).
 *
 * 4 couches doctrine super_admin (feedback_super_admin_destructive_actions_pattern) :
 *   1. UI gating   : bouton rendu seulement si role==='super_admin' (page.tsx)
 *   2. Server      : requireSuperAdmin() ci-dessous (throw si role insuffisant)
 *   3. Audit log   : action='rgpd_export' (export de donnees personnelles, RGPD)
 *   4. Test        : export-action.test.ts
 *
 * Reutilise listContactsPaginated (perPage eleve) pour respecter exactement
 * les memes filtres que la page /admin/contacts (pole, langue, brevo,
 * lifecycle, marketing, prospect) sans dupliquer la logique de filtre.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { csvFileName, serializeCsv } from '@/lib/csv';
import { listContactsPaginated, type ContactListFilters } from '@/lib/contacts/admin-queries';
import { PROSPECT_STATUS_LABEL_FR, type ProspectStatus } from '@/lib/supabase/queries';

export type ExportContactsFilters = Omit<ContactListFilters, 'page' | 'perPage'>;

/** Aligne sur le cap deja utilise par les exports societes/prospects. */
const EXPORT_MAX_ROWS = 5000;

export async function exportContactsCsvAction(
  filters: ExportContactsFilters,
): Promise<{ csv: string; filename: string }> {
  const profile = await requireSuperAdmin();

  const { rows } = await listContactsPaginated({
    ...filters,
    page: 1,
    perPage: EXPORT_MAX_ROWS,
  });

  const supabase = await createSupabaseServerClient();
  const contactIds = rows.map((r) => r.id);
  const companyIds = Array.from(new Set(rows.map((r) => r.company.id).filter(Boolean)));

  // Colonnes non couvertes par listContactsPaginated (utile a la vue liste,
  // pas a l'export) : linkedin_url, pays societe, statut du prospect le
  // plus recent lie a ce contact.
  const [{ data: linkedinRows }, { data: countryRows }, { data: prospectRows }] = await Promise.all(
    [
      contactIds.length > 0
        ? supabase.from('contacts').select('id, linkedin_url').in('id', contactIds)
        : Promise.resolve({ data: [] as { id: string; linkedin_url: string | null }[] }),
      companyIds.length > 0
        ? supabase.from('companies').select('id, country').in('id', companyIds)
        : Promise.resolve({ data: [] as { id: string; country: string | null }[] }),
      contactIds.length > 0
        ? supabase
            .from('prospects')
            .select('primary_contact_id, status, created_at')
            .in('primary_contact_id', contactIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({
            data: [] as { primary_contact_id: string | null; status: string; created_at: string }[],
          }),
    ],
  );

  const linkedinByContact = new Map((linkedinRows ?? []).map((r) => [r.id, r.linkedin_url]));
  const countryByCompany = new Map((countryRows ?? []).map((r) => [r.id, r.country]));
  // Trie desc par created_at deja applique en query -> premiere occurrence
  // par contact = statut du prospect le plus recent.
  const statusByContact = new Map<string, ProspectStatus>();
  for (const p of prospectRows ?? []) {
    if (p.primary_contact_id && !statusByContact.has(p.primary_contact_id)) {
      statusByContact.set(p.primary_contact_id, p.status as ProspectStatus);
    }
  }

  const csv = serializeCsv(
    [
      { key: 'id', label: 'ID' },
      { key: 'first_name', label: 'Prenom' },
      { key: 'last_name', label: 'Nom' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Telephone' },
      { key: 'phone_mobile', label: 'Mobile' },
      { key: 'linkedin_url', label: 'LinkedIn' },
      { key: 'role', label: 'Fonction' },
      { key: 'is_primary', label: 'Contact principal' },
      { key: 'language', label: 'Langue' },
      { key: 'company_id', label: 'ID societe' },
      { key: 'company_name', label: 'Societe' },
      { key: 'company_country', label: 'Pays societe' },
      { key: 'is_prospect', label: 'Est prospect' },
      { key: 'prospect_status', label: 'Statut prospect' },
      { key: 'lifecycle_emails_enabled', label: 'Lifecycle actif' },
      { key: 'marketing_consent', label: 'Consentement marketing' },
      { key: 'brevo_synced', label: 'Synchronise Brevo' },
      { key: 'brevo_contact_id', label: 'ID Brevo' },
      { key: 'created_at', label: 'Cree le' },
    ],
    rows.map((row) => {
      const status = statusByContact.get(row.id);
      return {
        id: row.id,
        first_name: row.first_name ?? '',
        last_name: row.last_name ?? '',
        email: row.email,
        phone: row.phone ?? '',
        phone_mobile: row.phone_mobile ?? '',
        linkedin_url: linkedinByContact.get(row.id) ?? '',
        role: row.role ?? '',
        is_primary: row.is_primary,
        language: row.language,
        company_id: row.company.id,
        company_name: row.company.name,
        company_country: countryByCompany.get(row.company.id) ?? '',
        is_prospect: row.is_prospect,
        prospect_status: status ? (PROSPECT_STATUS_LABEL_FR[status] ?? status) : '',
        lifecycle_emails_enabled: row.lifecycle_emails_enabled,
        marketing_consent: row.marketing_consent,
        brevo_synced: Boolean(row.brevo_contact_id),
        brevo_contact_id: row.brevo_contact_id ?? '',
        created_at: row.created_at.slice(0, 10),
      };
    }),
  );

  // Audit RGPD obligatoire : qui, quand, combien de lignes (donnees
  // personnelles exportees). action='rgpd_export' (enum audit_action
  // existant, aucune migration necessaire).
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'contacts',
    entity_id: null,
    action: 'rgpd_export',
    after: { kind: 'contacts_exported', row_count: rows.length, filters } as never,
  });

  return { csv, filename: csvFileName('contacts-export') };
}
