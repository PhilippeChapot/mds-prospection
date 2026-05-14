/**
 * P5.x.21 — tests enrichOrphanCompaniesFromBrevo.
 *
 * On mocke getSupabaseServiceClient + global.fetch (Brevo paginated) +
 * setContactListMembership (no-op).
 *
 * Validation :
 *   - société orpheline avec domain matché → INSERT contact + add to list
 *   - société orpheline sans match → skip (domainsNoMatch++)
 *   - société orpheline avec primary_domain dans free-email-domains → skip
 *   - 0 orpheline → return early avec contactsCreated=0
 *   - pagination s'arrête quand batch < PAGE_SIZE
 *   - BREVO_API_KEY manquant → throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

interface CompanyRow {
  id: string;
  name: string;
  primary_domain: string | null;
  alternate_domains: string[] | null;
  contacts: Array<{ id: string }>;
}

interface BrevoContact {
  id: number;
  email: string;
  attributes?: Record<string, unknown>;
}

interface State {
  companies: CompanyRow[];
  brevoPages: BrevoContact[][];
  contactsInserted: Array<Record<string, unknown>>;
  existingEmails: Set<string>;
}

function mockSupabase(state: State) {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'companies') {
          return {
            select: () => ({
              not: () => Promise.resolve({ data: state.companies, error: null }),
            }),
          };
        }
        if (table === 'contacts') {
          return {
            select: () => ({
              ilike: (_col: string, email: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.existingEmails.has(email.toLowerCase()) ? { id: 'existing' } : null,
                    error: null,
                  }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              state.contactsInserted.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

function mockBrevoFetch(pages: BrevoContact[][]) {
  let pageIdx = 0;
  global.fetch = vi.fn().mockImplementation((url: string | URL) => {
    const urlStr = url.toString();
    // setContactListMembership = POST .../contacts/add or .../contacts/remove
    if (urlStr.includes('/contacts/lists/')) {
      return Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as Response);
    }
    // GET /v3/contacts?limit=...&offset=...
    const page = pages[pageIdx] ?? [];
    pageIdx += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ contacts: page, count: page.length }),
      text: () => Promise.resolve(''),
    } as Response);
  });
}

describe('enrichOrphanCompaniesFromBrevo (P5.x.21)', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_LIST_PROSPECTION_STANDARD_ID = '247';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.BREVO_API_KEY) delete process.env.BREVO_API_KEY;
    if (!ENV_BACKUP.BREVO_LIST_PROSPECTION_STANDARD_ID)
      delete process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('matches orphan company by domain and inserts contact', async () => {
    const state: State = {
      companies: [
        {
          id: 'co-1',
          name: 'Acme',
          primary_domain: 'acme.com',
          alternate_domains: null,
          contacts: [],
        },
      ],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(),
    };
    mockSupabase(state);
    mockBrevoFetch([
      [
        {
          id: 999,
          email: 'lead@acme.com',
          attributes: { FIRSTNAME: 'Alice', LASTNAME: 'Lead', LANGUE: 'EN' },
        },
      ],
      [], // end pagination
    ]);

    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    const result = await enrichOrphanCompaniesFromBrevo({ maxEnrichments: 100, maxPages: 5 });

    expect(result.orphansWithDomain).toBe(1);
    expect(result.brevoTotalScanned).toBe(1);
    expect(result.domainsMatched).toBe(1);
    expect(result.contactsCreated).toBe(1);
    expect(state.contactsInserted).toHaveLength(1);
    const inserted = state.contactsInserted[0];
    expect(inserted.company_id).toBe('co-1');
    expect(inserted.email).toBe('lead@acme.com');
    expect(inserted.brevo_contact_id).toBe('999');
    expect(inserted.first_name).toBe('Alice');
    expect(inserted.language).toBe('EN');
    expect(inserted.is_primary).toBe(true);
    expect(inserted.marketing_consent).toBe(true);
  });

  it('skips orphan when no Brevo contact matches its domain', async () => {
    const state: State = {
      companies: [
        {
          id: 'co-1',
          name: 'NoMatch',
          primary_domain: 'unknown.com',
          alternate_domains: null,
          contacts: [],
        },
      ],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(),
    };
    mockSupabase(state);
    mockBrevoFetch([[{ id: 1, email: 'someone@other.com' }], []]);

    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    const result = await enrichOrphanCompaniesFromBrevo({ maxPages: 5 });

    expect(result.contactsCreated).toBe(0);
    expect(result.domainsNoMatch).toBe(1);
    expect(state.contactsInserted).toHaveLength(0);
  });

  it('skips orphan whose primary_domain is in free-email-domains list (gmail.com)', async () => {
    const state: State = {
      companies: [
        {
          id: 'co-bad',
          name: 'BadData',
          primary_domain: 'gmail.com',
          alternate_domains: null,
          contacts: [],
        },
      ],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(),
    };
    mockSupabase(state);
    mockBrevoFetch([
      [{ id: 1, email: 'random@gmail.com' }], // would match if not filtered
      [],
    ]);

    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    const result = await enrichOrphanCompaniesFromBrevo({ maxPages: 5 });

    expect(result.orphansSkippedFreeProvider).toBe(1);
    expect(result.contactsCreated).toBe(0);
    expect(state.contactsInserted).toHaveLength(0);
  });

  it('skips already-contacted companies (left-join filter)', async () => {
    const state: State = {
      companies: [
        {
          id: 'co-has-contact',
          name: 'HasContact',
          primary_domain: 'has.com',
          alternate_domains: null,
          contacts: [{ id: 'c-existing' }], // already has a contact → not orphan
        },
      ],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(),
    };
    mockSupabase(state);
    mockBrevoFetch([[{ id: 1, email: 'someone@has.com' }], []]);

    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    const result = await enrichOrphanCompaniesFromBrevo({ maxPages: 5 });

    expect(result.orphansWithDomain).toBe(0);
    expect(result.contactsCreated).toBe(0);
    expect(state.contactsInserted).toHaveLength(0);
  });

  it('throws when BREVO_API_KEY missing', async () => {
    delete process.env.BREVO_API_KEY;
    const state: State = {
      companies: [],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(),
    };
    mockSupabase(state);
    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    await expect(enrichOrphanCompaniesFromBrevo({ maxPages: 1 })).rejects.toThrow(/BREVO_API_KEY/);
  });

  it('skips when contact email already exists in DB (anti-doublon)', async () => {
    const state: State = {
      companies: [
        {
          id: 'co-1',
          name: 'Acme',
          primary_domain: 'acme.com',
          alternate_domains: null,
          contacts: [],
        },
      ],
      brevoPages: [],
      contactsInserted: [],
      existingEmails: new Set(['lead@acme.com']),
    };
    mockSupabase(state);
    mockBrevoFetch([[{ id: 999, email: 'lead@acme.com' }], []]);

    const { enrichOrphanCompaniesFromBrevo } = await import('./brevo-enrich');
    const result = await enrichOrphanCompaniesFromBrevo({ maxPages: 5 });

    expect(result.contactsCreated).toBe(0);
    expect(result.domainsNoMatch).toBe(1);
    expect(state.contactsInserted).toHaveLength(0);
  });
});
