/**
 * Query liste des societes exclues du programme commission affilie —
 * P7.x.1.D
 *
 * Doctrine : seuls les exposants PRS 2026 (companies.category=
 * 'prs_exhibitor') sont exclus. Toute autre societe est eligible.
 *
 * RGPD : on n'expose JAMAIS d'email ou de telephone contact ici. Seul
 * le nom de societe + le domaine primaire (info publique BtoB) sont
 * remontes a l'affilie.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface ExcludedCompany {
  id: string;
  name: string;
  primaryDomain: string | null;
}

export async function listExcludedCompanies(): Promise<ExcludedCompany[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, primary_domain')
    .eq('category', 'prs_exhibitor')
    .order('name', { ascending: true });

  if (error || !data) {
    console.warn('[affiliates/excluded-companies] query-failed: %s', error?.message ?? 'unknown');
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    primaryDomain: row.primary_domain,
  }));
}
