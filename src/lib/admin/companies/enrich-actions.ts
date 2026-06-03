'use server';

/**
 * P5.x.CompaniesAddressAndTags — server actions enrich company via Apollo.
 *
 * Reuse apolloOrganizationEnrich (P5.x.Apollo) :
 *   - input: companies.website ou primary_domain
 *   - output: raw_address, city, postal_code, country, phone
 *
 * UPSERT POLICY : ne JAMAIS ecraser une valeur deja non-vide
 * (doctrine [[external-events-import-doctrine]]). Apollo enrichit
 * uniquement les champs manquants.
 *
 * RBAC : admin/super_admin uniquement (sales ne peut pas declencher
 * une depense de credit Apollo).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { apolloOrganizationEnrich, ApolloError } from '@/lib/apollo/client';
import { normalizeDomain } from '@/lib/utils/domain';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const schema = z.object({ company_id: z.string().uuid() });

export async function enrichCompanyAddressFromApolloAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ fieldsUpdated: string[] }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Reserve aux admins (consomme du credit Apollo).' };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select(
      'id, name, website, primary_domain, raw_address, city, postal_code, country, phone, industry, linkedin_url',
    )
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!company) return { ok: false, error: 'Societe introuvable.' };

  // Resolution du domaine : website ou primary_domain.
  const domainSource = company.website ?? company.primary_domain;
  if (!domainSource) {
    return {
      ok: false,
      error: 'Site web ou domaine principal requis pour Apollo enrichment.',
    };
  }
  const domain = normalizeDomain(domainSource);
  if (!domain) {
    return { ok: false, error: 'Domaine invalide.' };
  }

  let enriched;
  try {
    enriched = await apolloOrganizationEnrich(domain);
  } catch (err) {
    const msg =
      err instanceof ApolloError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Apollo error: ${msg}` };
  }
  if (!enriched) {
    return { ok: false, error: 'Aucune donnee Apollo trouvee pour ce domaine.' };
  }

  // Upsert SANS ecraser les non-vides.
  const updates: Record<string, unknown> = {};
  if (!company.raw_address && enriched.raw_address) updates.raw_address = enriched.raw_address;
  if (!company.city && enriched.city) updates.city = enriched.city;
  if (!company.postal_code && enriched.postal_code) updates.postal_code = enriched.postal_code;
  if (!company.country && enriched.country) updates.country = enriched.country;
  if (!company.phone && enriched.primary_phone?.sanitized_number) {
    updates.phone = enriched.primary_phone.sanitized_number;
  } else if (!company.phone && enriched.primary_phone?.number) {
    updates.phone = enriched.primary_phone.number;
  }
  if (!company.industry && enriched.industry) updates.industry = enriched.industry;
  if (!company.linkedin_url && enriched.linkedin_url) updates.linkedin_url = enriched.linkedin_url;

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { fieldsUpdated: [] } };
  }

   
  const { error: updErr } = await supabase
    .from('companies')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', company.id);
  if (updErr) return { ok: false, error: `Update DB: ${updErr.message}` };

  // Audit log.
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: company.id,
    action: 'update',
    after: {
      kind: 'company_apollo_enrich_address',
      actor_role: profile.role,
      fields_updated: Object.keys(updates),
    } as never,
  });

  revalidatePath(`/admin/companies/${company.id}/edit`);
  revalidatePath(`/admin/companies/${company.id}`);
  return { ok: true, data: { fieldsUpdated: Object.keys(updates) } };
}
