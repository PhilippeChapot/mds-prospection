/**
 * P5.x.ConnectOnAirDirectoryCache — helper synchrone partage entre les
 * server actions d enrichissement (Apollo + ConnectOnAir).
 *
 * Pourquoi un fichier separe : la doctrine
 * [[feedback_pnpm_build_before_push_server_files]] interdit aux fichiers
 * 'use server' d exporter autre chose que des async functions. Le type
 * EnrichmentSource + EnrichmentFields sont des exports non-async, donc
 * ils vivent ici.
 *
 * Regles de upsert (doctrine [[normalize-name-for-matching]] + brief
 * P5.x.CompaniesAddressAndTags) :
 *   - JAMAIS ecraser un champ deja non-vide.
 *   - Apres update, set last_enrichment_source + last_enriched_at +
 *     updated_at.
 *   - Retourne la liste des champs effectivement appliques (pour audit
 *     log + UI feedback).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type EnrichmentSource = 'connectonair' | 'apollo' | 'manual';

export type EnrichmentFields = {
  raw_address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  linkedin_url?: string | null;
};

export type EnrichmentResult = {
  fieldsUpdated: string[];
};

/**
 * Applique un enrichissement sur public.companies :
 *   1. Lit la row courante.
 *   2. Calcule le diff (champs vides cote DB + valeur non-vide cote enrich).
 *   3. UPDATE atomique avec last_enrichment_source + last_enriched_at.
 *
 * Note : pas de 'use server' ici -> appelable depuis un fichier 'use server'
 * sans violer la doctrine. Retourne la liste des champs MAJ (vide = no-op).
 *
 * Throw si la company n existe pas ou si l UPDATE echoue (le caller
 * decide quoi en faire — typiquement renvoyer ok:false a l UI).
 */
export async function applyEnrichmentToCompany(
  companyId: string,
  source: EnrichmentSource,
  fields: EnrichmentFields,
  client?: SupabaseClient,
): Promise<EnrichmentResult> {
  const supabase = client ?? getSupabaseServiceClient();

  const { data: company, error: readErr } = await supabase
    .from('companies')
    .select('id, raw_address, city, postal_code, country, phone, website, industry, linkedin_url')
    .eq('id', companyId)
    .maybeSingle();
  if (readErr) throw new Error(`Read company: ${readErr.message}`);
  if (!company) throw new Error('Company not found');

  const updates: Record<string, unknown> = {};
  if (!company.raw_address && fields.raw_address) updates.raw_address = fields.raw_address;
  if (!company.city && fields.city) updates.city = fields.city;
  if (!company.postal_code && fields.postal_code) updates.postal_code = fields.postal_code;
  if (!company.country && fields.country) updates.country = fields.country;
  if (!company.phone && fields.phone) updates.phone = fields.phone;
  if (!company.website && fields.website) updates.website = fields.website;
  if (!company.industry && fields.industry) updates.industry = fields.industry;
  if (!company.linkedin_url && fields.linkedin_url) updates.linkedin_url = fields.linkedin_url;

  if (Object.keys(updates).length === 0) {
    return { fieldsUpdated: [] };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('companies')
    .update({
      ...updates,
      last_enrichment_source: source,
      last_enriched_at: now,
      updated_at: now,
    } as never)
    .eq('id', companyId);
  if (updErr) throw new Error(`Update company: ${updErr.message}`);

  return { fieldsUpdated: Object.keys(updates) };
}
