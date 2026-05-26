/**
 * P5.x.Apollo — types + helpers sync pour l'intégration Apollo.
 *
 * Ce fichier N'EST PAS marqué `'use server'` : il contient des types et
 * fonctions sync que les Server Components ET Client Components peuvent
 * importer. Le fichier `apollo-actions.ts` (avec `'use server'`) ne peut
 * exporter QUE des async functions (server actions) — d'où la séparation.
 */

import type { ApolloOrganization } from '@/lib/apollo/client';
import { normalizeDomain } from '@/lib/utils/domain';

// ---------------------------------------------------------------------------
// Types partagés (importables depuis client + server)
// ---------------------------------------------------------------------------

export interface CompanyMappedFromApollo {
  name: string;
  primary_domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  industry: string | null;
  employee_count: number | null;
  estimated_revenue_eur: number | null;
  parent_company: string | null;
  founded_year: number | null;
  description: string | null;
  keywords: string[];
  phone: string | null;
  raw_address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  apollo_organization_id: string;
  apollo_enriched_at: string;
  apollo_raw_data: ApolloOrganization;
}

export interface ExistingCompanyHit {
  id: string;
  name: string;
  primary_domain: string | null;
  apollo_organization_id: string | null;
}

export type EnrichApolloResult =
  | {
      ok: true;
      apolloOrg: ApolloOrganization;
      mapped: CompanyMappedFromApollo;
      existing: ExistingCompanyHit | null;
    }
  | { ok: false; error: string; code?: 'disabled' | 'not_domain' | 'not_found' | 'api_error' };

import type { ApolloCreditUsage } from '@/lib/apollo/client';
export type GetCreditsResult =
  | { ok: true; usage: ApolloCreditUsage | null }
  | { ok: false; error: string };

export type CreateProspectResult =
  | { ok: true; prospect_id: string; company_id: string; contact_id: string | null }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Mapper sync Apollo -> structure interne MDS
// ---------------------------------------------------------------------------

export function mapApolloToCompany(
  org: ApolloOrganization,
  fallbackDomain: string,
): CompanyMappedFromApollo {
  const websiteDomain = org.website_url
    ? normalizeDomain(org.website_url.replace(/^https?:\/\//, ''))
    : null;
  return {
    name: org.name?.trim() || fallbackDomain,
    primary_domain: websiteDomain || fallbackDomain,
    website: org.website_url ?? null,
    linkedin_url: org.linkedin_url ?? null,
    industry: org.industry ?? null,
    employee_count:
      typeof org.estimated_num_employees === 'number' ? org.estimated_num_employees : null,
    estimated_revenue_eur:
      typeof org.organization_revenue === 'number' ? Math.round(org.organization_revenue) : null,
    parent_company: org.owned_by_organization?.name ?? null,
    founded_year: typeof org.founded_year === 'number' ? org.founded_year : null,
    description: org.short_description ?? null,
    keywords: Array.isArray(org.keywords) ? org.keywords.slice(0, 30) : [],
    phone: org.primary_phone?.sanitized_number ?? org.primary_phone?.number ?? null,
    raw_address: org.raw_address ?? null,
    city: org.city ?? null,
    postal_code: org.postal_code ?? null,
    country: org.country ?? null,
    apollo_organization_id: org.id,
    apollo_enriched_at: new Date().toISOString(),
    apollo_raw_data: org,
  };
}
