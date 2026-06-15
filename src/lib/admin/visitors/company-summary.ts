'use server';

/**
 * P15.2 — résumé Apollo léger d'une société (pour la bannière Big Co du wizard).
 */
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type CompanyApolloSummary = {
  name: string;
  employee_count: number | null;
  industry: string | null;
};

export async function getCompanyApolloSummaryAction(
  companyId: string,
): Promise<CompanyApolloSummary | null> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('companies')
    .select('name, employee_count, industry')
    .eq('id', companyId)
    .maybeSingle();
  return data ?? null;
}
