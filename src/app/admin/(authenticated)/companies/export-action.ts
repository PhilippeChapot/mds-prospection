'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { csvFileName, serializeCsv } from '@/lib/csv';
import { listCompaniesPaginated } from '@/lib/supabase/queries';
import { POLE_CODES } from '@/lib/design-tokens';
import type { Database } from '@/lib/supabase/database.types';

type CategoryTarif = Database['public']['Enums']['category_tarif'];

const CATEGORY_LABEL_FR: Record<CategoryTarif, string> = {
  prs_exhibitor: 'PRS exposant',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

export type ExportCompaniesFilters = {
  q?: string;
  pole?: string;
  category?: string;
  country?: string;
};

export async function exportCompaniesCsvAction(
  filters: ExportCompaniesFilters,
): Promise<{ csv: string; filename: string }> {
  await requireAdminProfile();
  const _supabase = await createSupabaseServerClient();
  void _supabase; // RLS check via createSupabaseServerClient call elsewhere

  const result = await listCompaniesPaginated({
    q: filters.q?.trim() || undefined,
    poleCode:
      filters.pole && (POLE_CODES as readonly string[]).includes(filters.pole)
        ? filters.pole
        : null,
    category:
      filters.category && ['prs_exhibitor', 'standard', 'non_eligible'].includes(filters.category)
        ? (filters.category as CategoryTarif)
        : null,
    country: filters.country || null,
    page: 1,
    perPage: 5000,
  });

  const csv = serializeCsv(
    [
      { key: 'name', label: 'Societe' },
      { key: 'primary_domain', label: 'Domaine' },
      { key: 'country', label: 'Pays' },
      { key: 'category', label: 'Categorie' },
      { key: 'pole', label: 'Pole' },
      { key: 'was_prs_2026_exhibitor', label: 'Exposant PRS 2026' },
      { key: 'created_at', label: 'Cree le' },
    ],
    result.rows.map((row) => ({
      name: row.name,
      primary_domain: row.primary_domain ?? '',
      country: row.country ?? '',
      category: CATEGORY_LABEL_FR[row.category],
      pole: row.pole?.name_fr ?? '',
      was_prs_2026_exhibitor: row.was_prs_2026_exhibitor,
      created_at: row.created_at.slice(0, 10),
    })),
  );

  return { csv, filename: csvFileName('companies-export') };
}
