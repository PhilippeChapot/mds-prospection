/**
 * P5.x.24 — test createProspectAction avec contact_id (UPSERT path).
 *
 * Validation : si on passe contact_id (mode 'existing'), l'action utilise
 * directement ce contact sans tenter l'insert, et refuse si la company ne
 * matche pas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__REDIRECT__${url}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

interface State {
  contactById: Record<string, { id: string; company_id: string }>;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
}

function mockEnv(state: State) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve({ id: 'admin-1', role: 'admin', email: 'admin@x', full_name: 'Admin' }),
    getActiveSeasonId: () => Promise.resolve('season-1'),
  }));

  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () =>
      Promise.resolve({
        from: (table: string) => {
          if (table === 'contacts') {
            return {
              select: () => ({
                eq: (_col: string, val: unknown) => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: state.contactById[val as string] ?? null,
                      error: null,
                    }),
                }),
                ilike: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'prospects') {
            return {
              insert: (payload: Record<string, unknown>) => {
                state.inserts.push({ table, payload });
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: 'prospect-new' }, error: null }),
                  }),
                };
              },
            };
          }
          return {};
        },
      }),
  }));
}

describe('createProspectAction with contact_id (P5.x.24)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function makeForm(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it('with valid contact_id matching company → prospect created without contact INSERT', async () => {
    const companyId = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const contactId = 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925';
    const ownerId = '5402eb3e-f57d-41aa-b1ac-04a1ebc9f8af';
    const state: State = {
      contactById: { [contactId]: { id: contactId, company_id: companyId } },
      inserts: [],
    };
    mockEnv(state);

    const { createProspectAction } = await import('./actions');
    try {
      await createProspectAction(
        {},
        makeForm({
          company_mode: 'existing',
          company_id: companyId,
          contact_id: contactId,
          contact_mode: 'existing',
          contact_email: 'lead@acme.com',
          owner_id: ownerId,
        }),
      );
    } catch (err) {
      // redirect → throw expected
      expect((err as Error).message).toContain('__REDIRECT__/admin/prospects/prospect-new');
    }

    // 1 INSERT prospects, 0 INSERT contacts
    const prospectsInsert = state.inserts.find((i) => i.table === 'prospects');
    expect(prospectsInsert).toBeDefined();
    expect(prospectsInsert?.payload.primary_contact_id).toBe(contactId);
    expect(prospectsInsert?.payload.company_id).toBe(companyId);
    const contactsInsert = state.inserts.find((i) => i.table === 'contacts');
    expect(contactsInsert).toBeUndefined();
  });

  it('with contact_id not matching company → returns error', async () => {
    const companyA = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const companyB = '4c243c40-5d98-42f6-bd77-74b4970c94a9';
    const contactId = 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925';
    const ownerId = '5402eb3e-f57d-41aa-b1ac-04a1ebc9f8af';
    const state: State = {
      contactById: { [contactId]: { id: contactId, company_id: companyB } },
      inserts: [],
    };
    mockEnv(state);

    const { createProspectAction } = await import('./actions');
    const result = await createProspectAction(
      {},
      makeForm({
        company_mode: 'existing',
        company_id: companyA, // ≠ contact's company B
        contact_id: contactId,
        contact_mode: 'existing',
        contact_email: 'lead@acme.com',
        owner_id: ownerId,
      }),
    );

    expect(result.error).toMatch(/autre societe/i);
    expect(state.inserts.find((i) => i.table === 'prospects')).toBeUndefined();
  });
});
