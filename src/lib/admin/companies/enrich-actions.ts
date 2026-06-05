'use server';

/**
 * P5.x.CompaniesAddressAndTags + P5.x.ConnectOnAirDirectoryCache —
 * server actions enrich company address.
 *
 * Cascade : ConnectOnAir (cache local DB) -> Apollo (API live, payant).
 *
 * Sources :
 *   - ConnectOnAir : table connectonair_directory (import XLSX, gratuit).
 *   - Apollo       : apolloOrganizationEnrich (API live, ~$0.05/lookup).
 *
 * UPSERT POLICY : ne JAMAIS ecraser une valeur deja non-vide (doctrine
 * [[external-events-import-doctrine]]). Le helper applyEnrichmentToCompany
 * encapsule cette regle.
 *
 * RBAC : admin/super_admin uniquement (sales ne peut pas declencher une
 * depense de credit Apollo).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n exporte QUE des async functions. Les types + le helper
 * sync vivent dans ./enrich-helpers.ts.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { apolloOrganizationEnrich, ApolloError } from '@/lib/apollo/client';
import { normalizeDomain } from '@/lib/utils/domain';
import { normalizeNameJs } from '@/lib/external-events/normalize-query';
import { applyEnrichmentToCompany, type EnrichmentSource } from './enrich-helpers';

// Local typing for connectonair_directory rows. La table existe en DB
// (migration 0076) mais n est pas encore presente dans
// src/lib/supabase/database.types.ts (regenerer via `pnpm db:types`
// apres `pnpm db:push`). En attendant on cast les queries.
type CoaDirectoryMatch = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
};

type EnrichSuccess = {
  ok: true;
  source: EnrichmentSource;
  fieldsUpdated: string[];
  matchName?: string;
  cascadeUsed?: EnrichmentSource[];
};

type EnrichFailure = {
  ok: false;
  source: EnrichmentSource | 'none';
  error: string;
  matchName?: string;
  cascadeUsed?: EnrichmentSource[];
  coaError?: string;
  apolloError?: string;
};

export type EnrichActionResult = EnrichSuccess | EnrichFailure;

const schema = z.object({ company_id: z.string().uuid() });

// ───────────────────────────────────────────────────────────────────────
// 1. ConnectOnAir (cache local DB)
// ───────────────────────────────────────────────────────────────────────

export async function enrichCompanyAddressFromConnectOnAirAction(
  input: z.input<typeof schema>,
): Promise<EnrichActionResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Reserve aux admins.',
    };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      source: 'connectonair',
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = getSupabaseServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!company) {
    return { ok: false, source: 'connectonair', error: 'Societe introuvable.' };
  }

  const normalized = normalizeNameJs(company.name);
  if (!normalized) {
    return { ok: false, source: 'connectonair', error: 'Nom societe vide.' };
  }

  // 1) Match strict sur normalized_name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supaAny = supabase as any;
  let matches = ((
    await supaAny
      .from('connectonair_directory')
      .select('id, name, address, city, postal_code, country, phone, website')
      .eq('normalized_name', normalized)
      .limit(1)
  ).data ?? []) as CoaDirectoryMatch[];

  // 2) Fallback fuzzy ILIKE (au cas ou suffix manquant cote XLSX vs DB).
  if (matches.length === 0) {
    matches = ((
      await supaAny
        .from('connectonair_directory')
        .select('id, name, address, city, postal_code, country, phone, website')
        .ilike('normalized_name', `%${normalized}%`)
        .limit(1)
    ).data ?? []) as CoaDirectoryMatch[];
  }

  if (!matches || matches.length === 0) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Aucune correspondance dans le cache ConnectOnAir.',
    };
  }

  const best = matches[0];
  let result;
  try {
    result = await applyEnrichmentToCompany(parsed.data.company_id, 'connectonair', {
      raw_address: best.address ?? undefined,
      city: best.city ?? undefined,
      postal_code: best.postal_code ?? undefined,
      country: best.country ?? 'FR',
      phone: best.phone ?? undefined,
      website: best.website ?? undefined,
    });
  } catch (err) {
    return {
      ok: false,
      source: 'connectonair',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.fieldsUpdated.length === 0) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Aucun nouveau champ a appliquer (deja remplis).',
      matchName: best.name,
    };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: parsed.data.company_id,
    action: 'update',
    after: {
      kind: 'company_connectonair_enrich_address',
      actor_role: profile.role,
      fields_updated: result.fieldsUpdated,
      match_name: best.name,
    } as never,
  });

  revalidatePath(`/admin/companies/${parsed.data.company_id}/edit`);
  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return {
    ok: true,
    source: 'connectonair',
    fieldsUpdated: result.fieldsUpdated,
    matchName: best.name,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 2. Apollo (API live, payant)
// ───────────────────────────────────────────────────────────────────────

export async function enrichCompanyAddressFromApolloAction(
  input: z.input<typeof schema>,
): Promise<EnrichActionResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return {
      ok: false,
      source: 'apollo',
      error: 'Reserve aux admins (consomme du credit Apollo).',
    };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      source: 'apollo',
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = getSupabaseServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, website, primary_domain')
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!company) {
    return { ok: false, source: 'apollo', error: 'Societe introuvable.' };
  }

  const domainSource = company.website ?? company.primary_domain;
  if (!domainSource) {
    return {
      ok: false,
      source: 'apollo',
      error: 'Site web ou domaine principal requis pour Apollo.',
    };
  }
  const domain = normalizeDomain(domainSource);
  if (!domain) {
    return { ok: false, source: 'apollo', error: 'Domaine invalide.' };
  }

  let enriched;
  try {
    enriched = await apolloOrganizationEnrich(domain);
  } catch (err) {
    const msg =
      err instanceof ApolloError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, source: 'apollo', error: `Apollo error: ${msg}` };
  }
  if (!enriched) {
    return {
      ok: false,
      source: 'apollo',
      error: 'Aucune donnee Apollo trouvee pour ce domaine.',
    };
  }

  const phone = enriched.primary_phone?.sanitized_number ?? enriched.primary_phone?.number ?? null;

  let result;
  try {
    result = await applyEnrichmentToCompany(parsed.data.company_id, 'apollo', {
      raw_address: enriched.raw_address ?? undefined,
      city: enriched.city ?? undefined,
      postal_code: enriched.postal_code ?? undefined,
      country: enriched.country ?? undefined,
      phone: phone ?? undefined,
      industry: enriched.industry ?? undefined,
      linkedin_url: enriched.linkedin_url ?? undefined,
    });
  } catch (err) {
    return {
      ok: false,
      source: 'apollo',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.fieldsUpdated.length === 0) {
    return {
      ok: false,
      source: 'apollo',
      error: 'Aucun nouveau champ a appliquer (deja remplis).',
      matchName: enriched.name ?? undefined,
    };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: parsed.data.company_id,
    action: 'update',
    after: {
      kind: 'company_apollo_enrich_address',
      actor_role: profile.role,
      fields_updated: result.fieldsUpdated,
    } as never,
  });

  revalidatePath(`/admin/companies/${parsed.data.company_id}/edit`);
  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return {
    ok: true,
    source: 'apollo',
    fieldsUpdated: result.fieldsUpdated,
    matchName: enriched.name ?? undefined,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 3. Cascade (bouton principal "Enrichir automatiquement")
// ───────────────────────────────────────────────────────────────────────

export async function enrichCompanyAddressAction(
  input: z.input<typeof schema>,
): Promise<EnrichActionResult> {
  // Tentative 1 : ConnectOnAir (cache local, gratuit).
  const coaResult = await enrichCompanyAddressFromConnectOnAirAction(input);
  if (coaResult.ok) {
    return { ...coaResult, cascadeUsed: ['connectonair'] };
  }

  // Tentative 2 : Apollo (API live, payant).
  const apolloResult = await enrichCompanyAddressFromApolloAction(input);
  if (apolloResult.ok) {
    return {
      ...apolloResult,
      cascadeUsed: ['connectonair', 'apollo'],
    };
  }

  return {
    ok: false,
    source: 'none',
    error: "Aucune source n'a trouve cette company.",
    cascadeUsed: ['connectonair', 'apollo'],
    coaError: coaResult.error,
    apolloError: apolloResult.error,
  };
}
