/**
 * @vitest-environment node
 *
 * P5.x.CompanyNewApolloEnrich — mapping + détection de conflits + extraction
 * de domaine (purs).
 */

import { describe, it, expect } from 'vitest';
import {
  extractDomainFromQuery,
  mapOrgToPrefill,
  detectConflicts,
  type CompanyPrefill,
} from './apollo-prefill';
import type { ApolloOrganization } from '@/lib/apollo/client';

describe('extractDomainFromQuery (P5.x)', () => {
  it('domaine nu → domaine', () => {
    expect(extractDomainFromQuery('podcastmagazine.fr')).toBe('podcastmagazine.fr');
  });
  it('URL https → hostname sans www', () => {
    expect(extractDomainFromQuery('https://www.podcastmagazine.fr/abc')).toBe('podcastmagazine.fr');
  });
  it('URL LinkedIn → null (non enrichissable par domaine)', () => {
    expect(extractDomainFromQuery('https://linkedin.com/company/x')).toBeNull();
  });
  it('nom seul (avec espace) → null', () => {
    expect(extractDomainFromQuery('Podcast Magazine')).toBeNull();
  });
  it('mot sans TLD → null', () => {
    expect(extractDomainFromQuery('azerty')).toBeNull();
  });
});

function org(over: Partial<ApolloOrganization>): ApolloOrganization {
  return { id: 'org-1', ...over } as ApolloOrganization;
}

describe('mapOrgToPrefill (P5.x)', () => {
  it('mappe les champs + normalise le pays en ISO', () => {
    const p = mapOrgToPrefill(
      org({
        name: '  Podcast Magazine  ',
        primary_domain: 'podcastmagazine.fr',
        country: 'France',
        estimated_num_employees: 12,
        city: 'Paris',
        founded_year: 2010,
        industry: 'media',
      } as Partial<ApolloOrganization>),
    );
    expect(p.name).toBe('Podcast Magazine');
    expect(p.primary_domain).toBe('podcastmagazine.fr');
    expect(p.country).toBe('FR');
    expect(p.info.employees).toBe(12);
    expect(p.info.city).toBe('Paris');
    expect(p.info.foundedYear).toBe(2010);
  });

  it('fallback domaine depuis website_url si pas de primary_domain', () => {
    const p = mapOrgToPrefill(org({ name: 'X', website_url: 'https://www.x.com/path' }));
    expect(p.primary_domain).toBe('x.com');
  });

  it('pays inconnu → null', () => {
    const p = mapOrgToPrefill(
      org({ name: 'X', country: 'Zorglubie' } as Partial<ApolloOrganization>),
    );
    expect(p.country).toBeNull();
  });
});

function prefill(over: Partial<CompanyPrefill>): CompanyPrefill {
  return {
    name: null,
    primary_domain: null,
    country: null,
    apolloOrganizationId: 'org-1',
    info: {
      industry: null,
      employees: null,
      city: null,
      foundedYear: null,
      linkedinUrl: null,
      description: null,
    },
    ...over,
  };
}

describe('detectConflicts (P5.x) — 4 cas', () => {
  const next = prefill({
    name: 'Podcast Magazine',
    primary_domain: 'podcastmagazine.fr',
    country: 'FR',
  });

  it('rien rempli → aucun conflit', () => {
    expect(detectConflicts({ name: '', primary_domain: '', country: '' }, next)).toHaveLength(0);
  });
  it('tout rempli et différent → 3 conflits', () => {
    const c = detectConflicts(
      { name: 'Podcast Mag', primary_domain: 'old.fr', country: 'US' },
      next,
    );
    expect(c).toHaveLength(3);
    expect(c.find((x) => x.field === 'name')).toMatchObject({
      from: 'Podcast Mag',
      to: 'Podcast Magazine',
    });
  });
  it('partiel (seul le nom diffère, domaine vide) → 1 conflit', () => {
    const c = detectConflicts({ name: 'Podcast Mag', primary_domain: '', country: 'FR' }, next);
    expect(c.map((x) => x.field)).toEqual(['name']);
  });
  it('valeurs identiques (casse ignorée) → aucun conflit', () => {
    const c = detectConflicts(
      { name: 'podcast magazine', primary_domain: 'podcastmagazine.fr', country: 'fr' },
      next,
    );
    expect(c).toHaveLength(0);
  });
});
