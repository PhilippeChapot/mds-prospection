/**
 * @vitest-environment node
 *
 * P5.x.SmartAddApolloEnrichment — tests searchApolloDecisionMakersAction
 * + createContactsFromApolloCandidatesAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface Person {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  photo_url?: string | null;
  email?: string | null;
  email_status?: string | null;
}

interface State {
  enabled: boolean;
  company: {
    id: string;
    name: string;
    primary_domain: string | null;
    apollo_organization_id: string | null;
  } | null;
  existingContacts: Array<{
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;
  frPeople: Person[];
  globalPeople: Person[];
  // create
  dupEmails: Set<string>;
  inserted: Array<Record<string, unknown>>;
  insertError?: { code?: string; message: string } | null;
  audits: Array<Record<string, unknown>>;
}

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

const state: State = {
  enabled: true,
  company: null,
  existingContacts: [],
  frPeople: [],
  globalPeople: [],
  dupEmails: new Set(),
  inserted: [],
  insertError: null,
  audits: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: 'admin', email: 'a@b' }),
  }));
  vi.doMock('@/lib/apollo/sync-logger', () => ({
    logApolloCall: vi.fn().mockResolvedValue(undefined),
  }));
  class ApolloErrorMock extends Error {
    status: number;
    body: unknown;
    constructor(m: string, s: number, b: unknown) {
      super(m);
      this.status = s;
      this.body = b;
    }
  }
  vi.doMock('@/lib/apollo/client', () => ({
    ApolloError: ApolloErrorMock,
    isApolloEnabled: () => Promise.resolve(state.enabled),
    apolloPeopleSearch: vi.fn(async (input: { locations?: string[] }) =>
      input.locations && input.locations.length > 0 ? state.frPeople : state.globalPeople,
    ),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.company, error: null }),
              }),
            }),
          };
        }
        if (table === 'contacts') {
          return {
            select: () => ({
              // search : liste des contacts existants (awaited après .eq)
              eq: () => Promise.resolve({ data: state.existingContacts, error: null }),
              // create : dédup par email
              ilike: (_c: string, email: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.dupEmails.has(email.toLowerCase()) ? { id: 'dup' } : null,
                    error: null,
                  }),
              }),
            }),
            insert: (row: Record<string, unknown>) => ({
              select: () => ({
                single: () => {
                  if (state.insertError)
                    return Promise.resolve({ data: null, error: state.insertError });
                  state.inserted.push(row);
                  return Promise.resolve({
                    data: { id: `c-${state.inserted.length}` },
                    error: null,
                  });
                },
              }),
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.audits.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

function reset() {
  state.enabled = true;
  state.company = {
    id: COMPANY_ID,
    name: 'Acme Media',
    primary_domain: 'acme.fr',
    apollo_organization_id: 'apollo-org-1',
  };
  state.existingContacts = [];
  state.frPeople = [];
  state.globalPeople = [];
  state.dupEmails = new Set();
  state.inserted = [];
  state.insertError = null;
  state.audits = [];
}

beforeEach(() => {
  reset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('searchApolloDecisionMakersAction (P5.x)', () => {
  it('Apollo désactivé → ok:false', async () => {
    state.enabled = false;
    mockEnv();
    const { searchApolloDecisionMakersAction } = await import('./search-decision-makers');
    const r = await searchApolloDecisionMakersAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
  });

  it('société sans domaine ni apollo_org_id → ok:false', async () => {
    state.company = {
      id: COMPANY_ID,
      name: 'X',
      primary_domain: null,
      apollo_organization_id: null,
    };
    mockEnv();
    const { searchApolloDecisionMakersAction } = await import('./search-decision-makers');
    const r = await searchApolloDecisionMakersAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(false);
  });

  it('happy path : mappe + priorité 1 en tête + titres hors cible filtrés', async () => {
    state.frPeople = [
      { id: 'p1', first_name: 'Anne', last_name: 'Martin', title: 'Marketing Manager' }, // prio 2
      { id: 'p2', first_name: 'Paul', last_name: 'Durand', title: 'Directeur Général' }, // prio 1
      { id: 'p3', first_name: 'Zoe', last_name: 'Stage', title: 'Stagiaire' }, // hors cible
    ];
    mockEnv();
    const { searchApolloDecisionMakersAction } = await import('./search-decision-makers');
    const r = await searchApolloDecisionMakersAction({ company_id: COMPANY_ID });
    expect(r.ok).toBe(true);
    expect(r.candidates.map((c) => c.apolloId)).toEqual(['p2', 'p1']); // prio1 d'abord, stagiaire exclu
    expect(r.candidates[0].priority).toBe(1);
  });

  it('dédup vs contacts existants (email + nom)', async () => {
    state.existingContacts = [
      { email: 'paul@acme.fr', first_name: 'Paul', last_name: 'Durand' },
      { email: null, first_name: 'Anne', last_name: 'Martin' },
    ];
    state.frPeople = [
      { id: 'p1', first_name: 'Anne', last_name: 'Martin', title: 'Directeur Marketing' }, // dup par nom
      {
        id: 'p2',
        first_name: 'Paul',
        last_name: 'Durand',
        title: 'CEO',
        email: 'paul@acme.fr',
        email_status: 'verified',
      }, // dup par email
      { id: 'p3', first_name: 'Neuf', last_name: 'Venu', title: 'CMO' }, // gardé
    ];
    mockEnv();
    const { searchApolloDecisionMakersAction } = await import('./search-decision-makers');
    const r = await searchApolloDecisionMakersAction({ company_id: COMPANY_ID });
    expect(r.candidates.map((c) => c.apolloId)).toEqual(['p3']);
    expect(r.dedupedCount).toBe(2);
  });

  it('France d’abord + fallback global mergé (dédup par id Apollo)', async () => {
    state.frPeople = [{ id: 'fr1', first_name: 'F', last_name: 'R', title: 'CEO' }];
    state.globalPeople = [
      { id: 'fr1', first_name: 'F', last_name: 'R', title: 'CEO' }, // doublon id → ignoré
      { id: 'gl2', first_name: 'G', last_name: 'L', title: 'CMO' },
    ];
    mockEnv();
    const { searchApolloDecisionMakersAction } = await import('./search-decision-makers');
    const r = await searchApolloDecisionMakersAction({ company_id: COMPANY_ID });
    expect(r.candidates.map((c) => c.apolloId).sort()).toEqual(['fr1', 'gl2']);
  });
});

describe('createContactsFromApolloCandidatesAction (P5.x)', () => {
  it('email verrouillé → placeholder déterministe + audit kind=contact_created_from_apollo', async () => {
    mockEnv();
    const { createContactsFromApolloCandidatesAction } = await import('./search-decision-makers');
    const r = await createContactsFromApolloCandidatesAction({
      company_id: COMPANY_ID,
      candidates: [
        { firstName: 'Paul', lastName: 'Durand', title: 'CEO', linkedinUrl: null, email: null },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.created).toBe(1);
    expect(state.inserted[0].email).toMatch(/@apollo-imported\.local$/);
    expect(state.inserted[0].role).toBe('CEO');
    expect((state.audits[0].after as { kind: string }).kind).toBe('contact_created_from_apollo');
  });

  it('email déjà présent → skip (pas d’insert)', async () => {
    state.dupEmails = new Set(['paul@acme.fr']);
    mockEnv();
    const { createContactsFromApolloCandidatesAction } = await import('./search-decision-makers');
    const r = await createContactsFromApolloCandidatesAction({
      company_id: COMPANY_ID,
      candidates: [
        {
          firstName: 'Paul',
          lastName: 'Durand',
          title: 'CEO',
          linkedinUrl: null,
          email: 'paul@acme.fr',
        },
      ],
    });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
    expect(state.inserted).toHaveLength(0);
  });

  it('course 23505 → skip propre (pas d’erreur)', async () => {
    state.insertError = { code: '23505', message: 'duplicate key' };
    mockEnv();
    const { createContactsFromApolloCandidatesAction } = await import('./search-decision-makers');
    const r = await createContactsFromApolloCandidatesAction({
      company_id: COMPANY_ID,
      candidates: [
        {
          firstName: 'Neuf',
          lastName: 'Venu',
          title: 'CMO',
          linkedinUrl: null,
          email: 'neuf@acme.fr',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
