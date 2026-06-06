/**
 * @vitest-environment node
 *
 * P5.x.ConnectOnAirContactsCache (V2) — tests helpers sync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEnrichmentToContact, normalizeEmailForMatching } from './enrich-helpers';

type Contact = {
  id: string;
  phone: string | null;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN' | null;
  linkedin_url: string | null;
};

function makeClient(contact: Contact | null, updates: Array<Record<string, unknown>>) {
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
        if (table === 'contacts' && lastFilterCol === 'id') {
          return Promise.resolve({ data: contact, error: null });
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

const CONTACT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('normalizeEmailForMatching (P5.x.ContactsCache V2)', () => {
  it('LOWER+TRIM symetrique', () => {
    expect(normalizeEmailForMatching('  Arnaud@Pubradio.FR ')).toBe('arnaud@pubradio.fr');
  });
  it('null / empty / sans @ -> null', () => {
    expect(normalizeEmailForMatching(null)).toBeNull();
    expect(normalizeEmailForMatching('')).toBeNull();
    expect(normalizeEmailForMatching('not-email')).toBeNull();
    expect(normalizeEmailForMatching('null')).toBeNull();
  });
});

describe('applyEnrichmentToContact (P5.x.ContactsCache V2)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Patch champs vides + skip champs deja remplis', async () => {
    const contact: Contact = {
      id: CONTACT_ID,
      phone: '+33', // deja rempli
      role: null,
      first_name: null,
      last_name: 'Existing',
      language: null,
      linkedin_url: null,
    };
    const updates: Array<Record<string, unknown>> = [];
    const r = await applyEnrichmentToContact(
      CONTACT_ID,
      'connectonair',
      {
        phone: '+33999', // ne doit PAS ecraser
        role: 'Responsable Radio',
        first_name: 'Arnaud',
        last_name: 'Benassy', // ne doit PAS ecraser ("Existing")
        language: 'FR',
        linkedin_url: 'https://lk/x',
      },
      makeClient(contact, updates),
    );
    expect(r.fieldsUpdated).toEqual(
      expect.arrayContaining(['role', 'first_name', 'language', 'linkedin_url']),
    );
    expect(r.fieldsUpdated).not.toContain('phone');
    expect(r.fieldsUpdated).not.toContain('last_name');
    const patch = updates[0];
    expect(patch.phone).toBeUndefined();
    expect(patch.last_name).toBeUndefined();
    expect(patch.role).toBe('Responsable Radio');
    expect(patch.last_enrichment_source).toBe('connectonair');
    expect(patch.last_enriched_at).toBeTruthy();
  });

  it('Tous champs remplis -> no-op + fieldsUpdated=[]', async () => {
    const contact: Contact = {
      id: CONTACT_ID,
      phone: '+33',
      role: 'R',
      first_name: 'F',
      last_name: 'L',
      language: 'FR',
      linkedin_url: 'https://lk',
    };
    const updates: Array<Record<string, unknown>> = [];
    const r = await applyEnrichmentToContact(
      CONTACT_ID,
      'connectonair',
      { phone: 'X', role: 'Y', linkedin_url: 'Z' },
      makeClient(contact, updates),
    );
    expect(r.fieldsUpdated).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it('Language : "fr" (lower CoA) -> UPPER "FR" cote MDS', async () => {
    const contact: Contact = {
      id: CONTACT_ID,
      phone: null,
      role: null,
      first_name: null,
      last_name: null,
      language: null,
      linkedin_url: null,
    };
    const updates: Array<Record<string, unknown>> = [];
    await applyEnrichmentToContact(
      CONTACT_ID,
      'connectonair',
      { language: 'FR' },
      makeClient(contact, updates),
    );
    expect(updates[0].language).toBe('FR');
  });

  it('Contact introuvable -> throw', async () => {
    await expect(
      applyEnrichmentToContact(CONTACT_ID, 'connectonair', { phone: '+33' }, makeClient(null, [])),
    ).rejects.toThrow(/not found/);
  });
});
