/**
 * @vitest-environment node
 *
 * P14.2 #9 — tests searchContactsForCalendarAction.
 *
 * Couvre :
 *   - priorisation contacts de la company du prospect lié
 *   - exclusion des emails déjà sélectionnés
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  prospect: null as Record<string, unknown> | null,
  companyContacts: [] as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>,
  fuzzyContacts: [] as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>,
};

function makeClient() {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: (_col: string, _val: unknown) => {
          if (table === 'prospects') {
            return {
              maybeSingle: () => Promise.resolve({ data: state.prospect }),
            };
          }
          return chain;
        },
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (fn: (v: unknown) => unknown) => {
          if (table === 'contacts') {
            return Promise.resolve({ data: state.companyContacts }).then(fn);
          }
          return Promise.resolve({ data: [] }).then(fn);
        },
        rpc: (_name: string, _args: unknown) => Promise.resolve({ data: state.fuzzyContacts }),
      };
      return chain;
    },
    rpc: (_name: string, _args: unknown) => Promise.resolve({ data: state.fuzzyContacts }),
  };
}

function mockDeps() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin' }),
  }));
}

describe('searchContactsForCalendarAction (P14.2 #9)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.prospect = null;
    state.companyContacts = [];
    state.fuzzyContacts = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('priorise les contacts de la company du prospect lié (isCompanyContact=true)', async () => {
    state.prospect = { company_id: 'comp-1' };
    state.companyContacts = [
      { id: 'c-1', email: 'alice@acme.com', first_name: 'Alice', last_name: 'Martin' },
      { id: 'c-2', email: 'bob@acme.com', first_name: 'Bob', last_name: 'Dupont' },
    ];
    state.fuzzyContacts = [
      // Contact externe retourné par fuzzy (différent de la company)
      { id: 'c-3', email: 'charlie@other.com', first_name: 'Charlie', last_name: null },
    ];
    mockDeps();
    const { searchContactsForCalendarAction } = await import('./actions');
    const result = await searchContactsForCalendarAction({
      query: 'ali',
      prospect_id: 'prospect-xyz',
      exclude_emails: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Les contacts company doivent être marqués isCompanyContact=true.
    const alice = result.data.find((c) => c.email === 'alice@acme.com');
    expect(alice).toBeDefined();
    expect(alice!.isCompanyContact).toBe(true);
    expect(alice!.displayName).toBe('Alice Martin');
    // Les contacts company doivent apparaître avant les fuzzy.
    const aliceIdx = result.data.findIndex((c) => c.email === 'alice@acme.com');
    const charlieIdx = result.data.findIndex((c) => c.email === 'charlie@other.com');
    if (charlieIdx !== -1) {
      expect(aliceIdx).toBeLessThan(charlieIdx);
    }
  });

  it('exclut les emails déjà sélectionnés (exclude_emails)', async () => {
    state.prospect = { company_id: 'comp-1' };
    state.companyContacts = [
      { id: 'c-1', email: 'alice@acme.com', first_name: 'Alice', last_name: null },
      { id: 'c-2', email: 'bob@acme.com', first_name: 'Bob', last_name: null },
    ];
    state.fuzzyContacts = [];
    mockDeps();
    const { searchContactsForCalendarAction } = await import('./actions');
    const result = await searchContactsForCalendarAction({
      query: '',
      prospect_id: 'prospect-xyz',
      exclude_emails: ['alice@acme.com'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const emails = result.data.map((c) => c.email);
    // alice est dans exclude_emails → ne doit pas apparaître.
    expect(emails).not.toContain('alice@acme.com');
    // bob n'est pas exclu → doit apparaître.
    expect(emails).toContain('bob@acme.com');
  });
});
