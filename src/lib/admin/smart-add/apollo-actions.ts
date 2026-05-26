'use server';

/**
 * P5.x.Apollo — server actions Smart Add via Apollo.io.
 *
 *   - enrichApolloAction      : pull Apollo /organizations/enrich par domaine
 *   - createProspectFromApolloAction : INSERT/UPSERT company + prospect (+ contact opt.)
 *
 * V1 Free tier : enrichissement organization ONLY (1 crédit/hit).
 * Pas de search par nom (nécessite Apollo Basic 49$/mo) — l'admin doit
 * fournir un domaine. La recherche par nom est gated côté UI.
 *
 * Tous les appels Apollo sont tracés dans `sync_logs` (target='apollo').
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile, getActiveSeasonId } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  apolloOrganizationEnrich,
  apolloGetCreditUsage,
  isApolloEnabled,
  isLikelyDomain,
  ApolloError,
  type ApolloOrganization,
} from '@/lib/apollo/client';
import { logApolloCall } from '@/lib/apollo/sync-logger';
import { normalizeDomain } from '@/lib/utils/domain';
// P5.x.Apollo fix : tous les types + le helper sync `mapApolloToCompany`
// vivent dans `apollo-mapping.ts`. Ce fichier 'use server' ne fait QUE des
// imports internes — AUCUN ré-export de type/constante. Next.js 16 traite
// chaque export d'un fichier 'use server' comme une server action runtime,
// même les `export type` (cause de la ReferenceError 500 en prod).
// Les call sites client doivent importer les types depuis ./apollo-mapping.
import {
  mapApolloToCompany,
  type EnrichApolloResult,
  type ExistingCompanyHit,
  type GetCreditsResult,
  type CreateProspectResult,
} from './apollo-mapping';

const LOG_PREFIX = '[admin/smart-add/apollo]';

// ---------------------------------------------------------------------------
// enrichApolloAction
// ---------------------------------------------------------------------------

const enrichSchema = z.object({
  query: z.string().trim().min(2).max(120),
});

export async function enrichApolloAction(
  input: z.infer<typeof enrichSchema>,
): Promise<EnrichApolloResult> {
  await requireAdminProfile();

  const parsed = enrichSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  if (!(await isApolloEnabled())) {
    return {
      ok: false,
      error:
        'Apollo désactivé. Activez-le dans Préférences > Intégrations (apollo_api_key + apollo_enabled).',
      code: 'disabled',
    };
  }

  if (!isLikelyDomain(parsed.data.query)) {
    return {
      ok: false,
      error:
        "V1 Free tier Apollo : merci de fournir un domaine (ex. tf1pub.fr) plutôt qu'un nom. La recherche par nom nécessite un upgrade Apollo Basic.",
      code: 'not_domain',
    };
  }

  const domain = normalizeDomain(parsed.data.query);
  const supabase = getSupabaseServiceClient();

  // Dédup : check si une company a déjà ce domaine (primary OR alternate).
  let existing: ExistingCompanyHit | null = null;
  {
    const { data } = await supabase
      .from('companies')
      .select('id, name, primary_domain, apollo_organization_id, alternate_domains')
      .or(`primary_domain.eq.${domain},alternate_domains.cs.{${domain}}`)
      .limit(1)
      .maybeSingle();
    if (data) {
      existing = {
        id: data.id,
        name: data.name,
        primary_domain: data.primary_domain,
        apollo_organization_id: data.apollo_organization_id,
      };
    }
  }

  let apolloOrg: ApolloOrganization | null;
  try {
    apolloOrg = await apolloOrganizationEnrich(domain);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s enrich-failed domain=%s msg=%s', LOG_PREFIX, domain, msg);
    await logApolloCall({
      entityType: 'companies',
      entityId: existing?.id ?? '00000000-0000-0000-0000-000000000000',
      operation: 'pull',
      status: 'error',
      errorMessage: msg,
      payload: {
        domain,
        http_status: err instanceof ApolloError ? err.status : null,
      },
    });
    return { ok: false, error: msg, code: 'api_error' };
  }

  if (!apolloOrg) {
    await logApolloCall({
      entityType: 'companies',
      entityId: existing?.id ?? '00000000-0000-0000-0000-000000000000',
      operation: 'pull',
      status: 'success',
      payload: { domain, hit: false },
    });
    return {
      ok: false,
      error: `Aucune société Apollo pour le domaine "${domain}".`,
      code: 'not_found',
    };
  }

  await logApolloCall({
    entityType: 'companies',
    entityId: existing?.id ?? '00000000-0000-0000-0000-000000000000',
    operation: 'pull',
    status: 'success',
    payload: {
      domain,
      hit: true,
      apollo_organization_id: apolloOrg.id,
      existing_company_id: existing?.id ?? null,
    },
  });

  return {
    ok: true,
    apolloOrg,
    mapped: mapApolloToCompany(apolloOrg, domain),
    existing,
  };
}

// ---------------------------------------------------------------------------
// getApolloCreditUsageAction — pour le badge UI compteur
// ---------------------------------------------------------------------------

export async function getApolloCreditUsageAction(): Promise<GetCreditsResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  if (!(await isApolloEnabled())) return { ok: true, usage: null };
  const usage = await apolloGetCreditUsage();
  return { ok: true, usage };
}

// ---------------------------------------------------------------------------
// createProspectFromApolloAction
// ---------------------------------------------------------------------------

const createSchema = z.object({
  mapped: z.object({
    name: z.string().min(1),
    primary_domain: z.string().nullable(),
    website: z.string().nullable(),
    linkedin_url: z.string().nullable(),
    industry: z.string().nullable(),
    employee_count: z.number().int().nullable(),
    estimated_revenue_eur: z.number().int().nullable(),
    parent_company: z.string().nullable(),
    founded_year: z.number().int().nullable(),
    description: z.string().nullable(),
    keywords: z.array(z.string()),
    phone: z.string().nullable(),
    raw_address: z.string().nullable(),
    city: z.string().nullable(),
    postal_code: z.string().nullable(),
    country: z.string().nullable(),
    apollo_organization_id: z.string(),
    apollo_enriched_at: z.string(),
    apollo_raw_data: z.unknown(),
  }),
  existing_company_id: z.string().uuid().nullable(),
  contact: z
    .object({
      first_name: z.string().trim().min(1).max(100).optional(),
      last_name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      role: z.string().trim().max(100).optional(),
    })
    .optional(),
  pole_code: z.string().nullable().optional(),
  category: z.enum(['standard', 'prs_exhibitor', 'non_eligible']).default('standard'),
});

export async function createProspectFromApolloAction(
  input: z.input<typeof createSchema>,
): Promise<CreateProspectResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const { mapped, existing_company_id, contact, pole_code, category } = parsed.data;

  const supabase = getSupabaseServiceClient();

  // 1. UPSERT company.
  let companyId: string;
  if (existing_company_id) {
    const { error } = await supabase
      .from('companies')
      .update({
        apollo_organization_id: mapped.apollo_organization_id,
        apollo_enriched_at: mapped.apollo_enriched_at,
        apollo_raw_data: mapped.apollo_raw_data as never,
        employee_count: mapped.employee_count,
        estimated_revenue_eur: mapped.estimated_revenue_eur,
        parent_company: mapped.parent_company,
        founded_year: mapped.founded_year,
      })
      .eq('id', existing_company_id);
    if (error) {
      console.error('%s company-update-failed msg=%s', LOG_PREFIX, error.message);
      return { ok: false, error: error.message };
    }
    companyId = existing_company_id;
  } else {
    // NB : `companies.pole_id` est une FK vers public.poles (pas un text enum).
    // V1 : on n'attribue pas le pôle automatiquement ; l'admin re-classifie
    // ensuite via /admin/companies/[id]. Le choix UI est conservé dans audit_log.
    void pole_code;
    const { data: created, error } = await supabase
      .from('companies')
      .insert({
        name: mapped.name,
        name_normalized: mapped.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim(),
        primary_domain: mapped.primary_domain,
        country: mapped.country ?? 'FR',
        category,
        apollo_organization_id: mapped.apollo_organization_id,
        apollo_enriched_at: mapped.apollo_enriched_at,
        apollo_raw_data: mapped.apollo_raw_data as never,
        employee_count: mapped.employee_count,
        estimated_revenue_eur: mapped.estimated_revenue_eur,
        parent_company: mapped.parent_company,
        founded_year: mapped.founded_year,
      })
      .select('id')
      .single();
    if (error || !created) {
      console.error('%s company-insert-failed msg=%s', LOG_PREFIX, error?.message);
      return { ok: false, error: error?.message ?? 'INSERT company échoué.' };
    }
    companyId = created.id;
  }

  // 2. INSERT contact si email fourni (sinon prospect sans primary_contact).
  let contactId: string | null = null;
  if (contact?.email) {
    const { data: createdContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        first_name: contact.first_name ?? null,
        last_name: contact.last_name ?? null,
        email: contact.email,
        role: contact.role ?? null,
        language: 'FR',
      })
      .select('id')
      .single();
    if (contactErr) {
      console.warn('%s contact-insert-failed msg=%s', LOG_PREFIX, contactErr.message);
      // best-effort : on continue sans contact si l'insert échoue.
    } else if (createdContact) {
      contactId = createdContact.id;
    }
  }

  // 3. INSERT prospect (status='lead', source='direct', source_detail='apollo_enrich').
  //    `season_id` est requis par le schema (FK saisons).
  const seasonId = await getActiveSeasonId();
  const { data: createdProspect, error: prospectErr } = await supabase
    .from('prospects')
    .insert({
      company_id: companyId,
      primary_contact_id: contactId,
      season_id: seasonId,
      status: 'lead',
      source: 'direct',
      source_detail: 'apollo_enrich',
      owner_id: profile.id,
    })
    .select('id')
    .single();
  if (prospectErr || !createdProspect) {
    console.error('%s prospect-insert-failed msg=%s', LOG_PREFIX, prospectErr?.message);
    return { ok: false, error: prospectErr?.message ?? 'INSERT prospect échoué.' };
  }

  // 4. Audit log + sync_logs success.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: 'create',
      entity_type: 'prospects',
      entity_id: createdProspect.id,
      after: {
        kind: 'created_via_apollo',
        company_id: companyId,
        contact_id: contactId,
        apollo_organization_id: mapped.apollo_organization_id,
        source: 'apollo_enrich',
        actor_role: profile.role,
      } as never,
    });
  } catch (auditErr) {
    console.warn('%s audit-log-failed msg=%s', LOG_PREFIX, String(auditErr));
  }

  await logApolloCall({
    entityType: 'prospects',
    entityId: createdProspect.id,
    operation: 'create',
    status: 'success',
    payload: {
      flow: 'create_from_enrich',
      company_id: companyId,
      contact_id: contactId,
      apollo_organization_id: mapped.apollo_organization_id,
    },
  });

  revalidatePath('/admin/contacts/quick-add');
  revalidatePath('/admin/prospects');

  return {
    ok: true,
    prospect_id: createdProspect.id,
    company_id: companyId,
    contact_id: contactId,
  };
}

// `mapApolloToCompany` est désormais dans `./apollo-mapping.ts` (helper sync
// non-async, interdit dans un fichier 'use server' depuis Next.js 16).
