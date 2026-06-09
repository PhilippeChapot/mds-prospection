import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface AddonDetail {
  id: string;
  name_fr: string;
  name_en: string;
  description_fr: string | null;
  price_eur_ht: number;
}

export async function getSignupAddonsDetails(addonIds: string[]): Promise<AddonDetail[]> {
  if (addonIds.length === 0) return [];
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('addon_options')
    .select('id, name_fr, name_en, description_fr, price_eur_ht')
    .in('id', addonIds);
  if (error) {
    console.warn('[getSignupAddonsDetails] failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name_fr: r.name_fr as string,
    name_en: r.name_en as string,
    description_fr: (r.description_fr as string | null) ?? null,
    price_eur_ht: Number(r.price_eur_ht),
  }));
}
