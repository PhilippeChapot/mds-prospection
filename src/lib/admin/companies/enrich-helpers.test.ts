/**
 * @vitest-environment node
 *
 * P5.x.ConnectOnAirDirectoryCache — tests helper sync applyEnrichmentToCompany.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEnrichmentToCompany } from './enrich-helpers';

type Company = {
  id: string;
  raw_address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  linkedin_url: string | null;
};

function makeClient(company: Company | null, updates: Array<Record<string, unknown>>) {
  function makeChain(table: string) {
    let lastFilterCol: string | null = null;
    let pendingPatch: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string) => {
        lastFilterCol = col;
        return chain;
      },
      maybeSingle: () => {
        if (table === 'companies' && lastFilterCol === 'id') {
          return Promise.resolve({ data: company, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: Record<string, unknown>) => {
        pendingPatch = patch;
        return chain;
      },
      then: (cb: (v: { error: null }) => unknown) => {
        if (pendingPatch) updates.push(pendingPatch);
        return Promise.resolve({ error: null }).then(cb);
      },
    };
    return chain;
  }
  return { from: (table: string) => makeChain(table) } as never;
}

const COMPANY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('applyEnrichmentToCompany (P5.x.ConnectOnAirDirectoryCache)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Patch champs vides + skip champs deja remplis', async () => {
    const company: Company = {
      id: COMPANY_ID,
      raw_address: null,
      city: 'Paris', // deja rempli
      postal_code: null,
      country: null,
      phone: '+33',
      website: null,
      industry: null,
      linkedin_url: null,
    };
    const updates: Array<Record<string, unknown>> = [];
    const r = await applyEnrichmentToCompany(
      COMPANY_ID,
      'connectonair',
      {
        raw_address: '12 rue Test',
        city: 'Lyon', // ne doit PAS ecraser
        postal_code: '75008',
        country: 'FR',
        phone: '+33999', // ne doit PAS ecraser
        website: 'https://x.fr',
      },
      makeClient(company, updates),
    );
    expect(r.fieldsUpdated).toEqual(
      expect.arrayContaining(['raw_address', 'postal_code', 'country', 'website']),
    );
    expect(r.fieldsUpdated).not.toContain('city');
    expect(r.fieldsUpdated).not.toContain('phone');
    const patch = updates[0];
    expect(patch.city).toBeUndefined();
    expect(patch.phone).toBeUndefined();
    expect(patch.last_enrichment_source).toBe('connectonair');
    expect(patch.last_enriched_at).toBeTruthy();
    expect(patch.updated_at).toBeTruthy();
  });

  it('Tous champs deja remplis → no-op (fieldsUpdated=[] + zero update)', async () => {
    const company: Company = {
      id: COMPANY_ID,
      raw_address: 'X',
      city: 'X',
      postal_code: 'X',
      country: 'FR',
      phone: 'X',
      website: 'X',
      industry: 'X',
      linkedin_url: 'X',
    };
    const updates: Array<Record<string, unknown>> = [];
    const r = await applyEnrichmentToCompany(
      COMPANY_ID,
      'apollo',
      {
        raw_address: 'Other',
        city: 'Other',
        postal_code: 'Other',
      },
      makeClient(company, updates),
    );
    expect(r.fieldsUpdated).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it('Company introuvable → throw', async () => {
    const updates: Array<Record<string, unknown>> = [];
    await expect(
      applyEnrichmentToCompany(
        COMPANY_ID,
        'connectonair',
        { raw_address: 'X' },
        makeClient(null, updates),
      ),
    ).rejects.toThrow(/not found/);
  });

  it('Source apollo set correctement', async () => {
    const company: Company = {
      id: COMPANY_ID,
      raw_address: null,
      city: null,
      postal_code: null,
      country: null,
      phone: null,
      website: null,
      industry: null,
      linkedin_url: null,
    };
    const updates: Array<Record<string, unknown>> = [];
    await applyEnrichmentToCompany(
      COMPANY_ID,
      'apollo',
      { city: 'Paris', postal_code: '75008' },
      makeClient(company, updates),
    );
    expect(updates[0].last_enrichment_source).toBe('apollo');
  });
});
