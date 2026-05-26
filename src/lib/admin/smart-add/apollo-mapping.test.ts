/**
 * P5.x.Apollo-bis — tests mapApolloToCompany.
 *
 * Régression-guard : on a perdu 95 % des données Apollo car le mapping ne
 * persistait qu'un sous-ensemble des champs. Ces tests vérifient que :
 *  1. tous les champs structurés sont mappés (industry, linkedin_url, phone,
 *     keywords, raw_address, city, postal_code, state, description,
 *     parent_company, etc.) ;
 *  2. le payload Apollo COMPLET est conservé dans apollo_raw_data (au moins
 *     20 clés, pas juste {id}) ;
 *  3. les valeurs falsy sont normalisées (null, []) sans casse.
 */

import { describe, it, expect } from 'vitest';
import type { ApolloOrganization } from '@/lib/apollo/client';
import { mapApolloToCompany } from './apollo-mapping';

// Payload Apollo réaliste avec 25+ champs (proche d'une réponse réelle).
const APOLLO_ORG_COMPLETE: ApolloOrganization = {
  id: 'apollo-org-freewheel',
  name: 'FreeWheel',
  website_url: 'https://www.freewheel.com',
  blog_url: 'https://www.freewheel.com/blog',
  linkedin_url: 'https://linkedin.com/company/freewheel',
  twitter_url: 'https://twitter.com/freewheel',
  facebook_url: 'https://facebook.com/freewheel',
  primary_phone: { number: '+1-212-555-0100', sanitized_number: '+12125550100' },
  industry: 'Marketing & Advertising',
  keywords: ['video', 'CTV', 'advertising', 'monetization', 'OTT'],
  estimated_num_employees: 1200,
  organization_revenue: 250_000_000,
  founded_year: 2007,
  short_description:
    'FreeWheel, A Comcast Company, provides comprehensive ad-management technology for media companies, publishers, and advertisers to monetize premium video content across screens.',
  raw_address: '1114 6th Avenue, New York, NY 10036, USA',
  street_address: '1114 6th Avenue',
  city: 'New York',
  state: 'New York',
  postal_code: '10036',
  country: 'United States',
  owned_by_organization: { id: 'parent-comcast', name: 'Comcast Corporation' },
  // Champs additionnels (pas mappés en colonnes mais préservés via jsonb).
  alexa_ranking: 12345,
  primary_domain_url: 'freewheel.com',
  publicly_traded_symbol: null,
  publicly_traded_exchange: null,
  logo_url: 'https://logo.clearbit.com/freewheel.com',
} as ApolloOrganization;

describe('mapApolloToCompany (P5.x.Apollo-bis — full payload persistence)', () => {
  it('1/ retourne TOUS les champs structurés (régression 95% data loss)', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.name).toBe('FreeWheel');
    expect(r.primary_domain).toBe('freewheel.com');
    expect(r.website).toBe('https://www.freewheel.com');
    expect(r.linkedin_url).toBe('https://linkedin.com/company/freewheel');
    expect(r.industry).toBe('Marketing & Advertising');
    expect(r.phone).toBe('+12125550100');
    expect(r.country).toBe('United States');
  });

  it('2/ persiste keywords (text[] non-vide, max 30) — gin index utilisable', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(Array.isArray(r.keywords)).toBe(true);
    expect(r.keywords.length).toBeGreaterThan(0);
    expect(r.keywords).toContain('CTV');
    expect(r.keywords).toContain('OTT');
  });

  it('3/ persiste raw_address + city + postal_code + state', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.raw_address).toBe('1114 6th Avenue, New York, NY 10036, USA');
    expect(r.city).toBe('New York');
    expect(r.postal_code).toBe('10036');
    expect(r.state).toBe('New York');
  });

  it('4/ persiste description (short_description) — > 100 chars pour FreeWheel', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.description).not.toBeNull();
    expect((r.description ?? '').length).toBeGreaterThan(100);
  });

  it('5/ persiste parent_company (owned_by_organization.name)', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.parent_company).toBe('Comcast Corporation');
  });

  it('6/ persiste employee_count + estimated_revenue_eur + founded_year', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.employee_count).toBe(1200);
    expect(r.estimated_revenue_eur).toBe(250_000_000);
    expect(r.founded_year).toBe(2007);
  });

  it('7/ apollo_raw_data conserve le payload COMPLET (≥20 clés, pas juste {id})', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    // Régression directe : avant le fix, apollo_raw_data ne contenait que {id}.
    const keys = Object.keys(r.apollo_raw_data as Record<string, unknown>);
    expect(keys.length).toBeGreaterThanOrEqual(20);
    // Doit inclure des champs NON mappés en colonnes (preuve qu'on garde tout).
    expect(keys).toContain('blog_url');
    expect(keys).toContain('twitter_url');
    expect(keys).toContain('alexa_ranking');
    expect(keys).toContain('logo_url');
  });

  it('8/ apollo_organization_id + apollo_enriched_at (timestamp ISO)', () => {
    const r = mapApolloToCompany(APOLLO_ORG_COMPLETE, 'freewheel.com');
    expect(r.apollo_organization_id).toBe('apollo-org-freewheel');
    // ISO 8601 UTC — doit parser sans erreur.
    expect(() => new Date(r.apollo_enriched_at)).not.toThrow();
    expect(r.apollo_enriched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('9/ payload minimal (only id) -> tous les champs nullables → null/[], pas de crash', () => {
    const minimal: ApolloOrganization = { id: 'minimal-org' };
    const r = mapApolloToCompany(minimal, 'fallback.com');
    expect(r.name).toBe('fallback.com'); // fallback domain
    expect(r.primary_domain).toBe('fallback.com');
    expect(r.industry).toBeNull();
    expect(r.linkedin_url).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.keywords).toEqual([]);
    expect(r.raw_address).toBeNull();
    expect(r.city).toBeNull();
    expect(r.postal_code).toBeNull();
    expect(r.state).toBeNull();
    expect(r.description).toBeNull();
    expect(r.parent_company).toBeNull();
    expect(r.employee_count).toBeNull();
    expect(r.estimated_revenue_eur).toBeNull();
    expect(r.founded_year).toBeNull();
  });

  it('10/ website_url avec trailing slash + www → primary_domain normalisé', () => {
    const org: ApolloOrganization = {
      id: 'org-norm',
      name: 'NormCo',
      website_url: 'https://www.normco.com/',
    };
    const r = mapApolloToCompany(org, 'normco.com');
    expect(r.primary_domain).toBe('normco.com');
    // website conservé tel quel pour affichage (display vs canonical).
    expect(r.website).toBe('https://www.normco.com/');
  });

  it('11/ phone : préfère sanitized_number quand dispo, sinon number', () => {
    const orgSanitized: ApolloOrganization = {
      id: 'o1',
      primary_phone: { number: '+33 1 41 41 55 55', sanitized_number: '+33141415555' },
    };
    const orgRaw: ApolloOrganization = {
      id: 'o2',
      primary_phone: { number: '+33 1 41 41 55 55', sanitized_number: null },
    };
    expect(mapApolloToCompany(orgSanitized, 'x.com').phone).toBe('+33141415555');
    expect(mapApolloToCompany(orgRaw, 'x.com').phone).toBe('+33 1 41 41 55 55');
  });

  it('12/ keywords cap à 30 (Apollo peut renvoyer 100+)', () => {
    const many: string[] = Array.from({ length: 100 }, (_, i) => `kw${i}`);
    const org: ApolloOrganization = { id: 'o', keywords: many };
    const r = mapApolloToCompany(org, 'x.com');
    expect(r.keywords).toHaveLength(30);
    expect(r.keywords[0]).toBe('kw0');
  });
});
