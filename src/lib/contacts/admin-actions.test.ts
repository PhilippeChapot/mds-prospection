/**
 * P5.x.22 — tests des server actions admin contacts.
 *
 * Validation :
 *   - addContactAction insert + sync Brevo
 *   - addContactAction refuse doublon email
 *   - markAsPrimaryAction : 2 UPDATEs (unset+set)
 *   - toggleLifecycleAction : UPDATE + setContactListMembership si brevo id
 *   - deleteContactAction : admin only (sales → 403)
 *   - deleteContactAction : refuse si contact primary sur un prospect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ENV_BACKUP = { ...process.env };

interface MockState {
  profile?: { id: string; role: 'admin' | 'sales'; email: string } | null;
  companyById?: Record<string, { id: string; name: string }>;
  contactByEmail?: Record<string, { id: string; company_id: string } | null>;
  contactById?: Record<string, Record<string, unknown>>;
  prospectsByPrimary?: Record<string, Array<{ id: string }>>;
  // operations captured for assertion
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; filter: string }>;
  deletes: Array<{ table: string; filter: string }>;
}

function mockEnv(state: MockState) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve(state.profile ?? { id: 'u-1', role: 'admin', email: 'admin@x' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        let currentFilter = '';
        const select = () => ({
          eq: (col: string, val: unknown) => {
            currentFilter = `${col}=${val}`;
            return select();
          },
          ilike: (col: string, val: unknown) => {
            currentFilter = `${col}~${val}`;
            const lookup = () => {
              if (table === 'contacts' && col === 'email') {
                return Promise.resolve({
                  data: state.contactByEmail?.[String(val).toLowerCase()] ?? null,
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            };
            return { maybeSingle: lookup, neq: () => ({ maybeSingle: lookup }) };
          },
          maybeSingle: () => {
            if (table === 'companies') {
              const id = currentFilter.split('=')[1];
              return Promise.resolve({ data: state.companyById?.[id] ?? null, error: null });
            }
            if (table === 'contacts') {
              const id = currentFilter.split('=')[1];
              return Promise.resolve({ data: state.contactById?.[id] ?? null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          limit: () => {
            if (table === 'prospects') {
              const id = currentFilter.split('=')[1];
              return Promise.resolve({
                data: state.prospectsByPrimary?.[id] ?? [],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
          // single response (`.select(...).single()`)
          single: () => Promise.resolve({ data: null, error: null }),
        });

        builder.select = (cols?: string) => {
          // chained .insert(...).select('id').maybeSingle()
          void cols;
          return select();
        };
        builder.insert = (payload: Record<string, unknown>) => {
          state.inserts.push({ table, payload });
          return {
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: table === 'contacts' ? { id: 'new-contact-id' } : { id: 'new-id' },
                  error: null,
                }),
            }),
            // direct `.insert(...)` without .select() (audit_log case)
            then: (resolve: (r: unknown) => void) => resolve({ data: null, error: null }),
          };
        };
        builder.update = (patch: Record<string, unknown>) => {
          // Create a chain that supports:
          //   .update(...).eq(col, val)            → awaits to { error: null }
          //   .update(...).eq(col, val).eq(...)    → awaits to { error: null }
          const makeChain = () => {
            const c: Record<string, unknown> = {};
            c.eq = (col: string, val: unknown) => {
              state.updates.push({ table, patch, filter: `${col}=${val}` });
              return makeChain();
            };
            c.then = (resolve: (r: unknown) => void) => resolve({ error: null });
            return c;
          };
          return makeChain();
        };
        builder.delete = () => ({
          eq: (col: string, val: unknown) => {
            state.deletes.push({ table, filter: `${col}=${val}` });
            return Promise.resolve({ error: null });
          },
        });
        return builder;
      },
    }),
  }));
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return {
    inserts: [],
    updates: [],
    deletes: [],
    ...overrides,
  };
}

describe('admin-actions (P5.x.22)', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_LIST_PROSPECTION_STANDARD_ID = '247';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Default: stub global.fetch (Brevo calls) to return 201 created
    global.fetch = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ id: 12345 }),
    } as Response);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.BREVO_API_KEY) delete process.env.BREVO_API_KEY;
    if (!ENV_BACKUP.BREVO_LIST_PROSPECTION_STANDARD_ID)
      delete process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('addContactAction inserts row + writes audit + syncs Brevo', async () => {
    const state = makeState({
      companyById: {
        '1a3e6756-5fde-476a-a735-72c25f44db6b': {
          id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          name: 'Acme',
        },
      },
      contactByEmail: { 'new@acme.com': null },
    });
    mockEnv(state);

    const { addContactAction } = await import('./admin-actions');
    const result = await addContactAction({
      company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
      email: 'new@acme.com',
      first_name: 'New',
      language: 'FR',
    });

    expect(result.ok).toBe(true);
    // 1× contact insert + 1× audit_log insert
    const contactsInsert = state.inserts.find((i) => i.table === 'contacts');
    const auditInsert = state.inserts.find((i) => i.table === 'audit_log');
    expect(contactsInsert).toBeDefined();
    expect(contactsInsert?.payload.email).toBe('new@acme.com');
    expect(auditInsert).toBeDefined();
    expect(auditInsert?.payload.entity_type).toBe('contacts');

    // After Brevo create (201), brevo_contact_id is stored
    const brevoUpdate = state.updates.find(
      (u) => u.table === 'contacts' && u.patch.brevo_contact_id === '12345',
    );
    expect(brevoUpdate).toBeDefined();
  });

  it('addContactAction refuses duplicate email globally', async () => {
    const state = makeState({
      companyById: {
        '1a3e6756-5fde-476a-a735-72c25f44db6b': {
          id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          name: 'Acme',
        },
      },
      contactByEmail: {
        'dup@acme.com': {
          id: '5402eb3e-f57d-41aa-b1ac-04a1ebc9f8af',
          company_id: '4c243c40-5d98-42f6-bd77-74b4970c94a9',
        },
      },
    });
    mockEnv(state);

    const { addContactAction } = await import('./admin-actions');
    const result = await addContactAction({
      company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
      email: 'dup@acme.com',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/déjà utilisé/i);
    expect(state.inserts.find((i) => i.table === 'contacts')).toBeUndefined();
  });

  it('markAsPrimaryAction issues 2 updates (unset + set)', async () => {
    const state = makeState({
      contactById: {
        'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': {
          id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
          company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          is_primary: false,
          email: 'a@b.com',
        },
      },
    });
    mockEnv(state);

    const { markAsPrimaryAction } = await import('./admin-actions');
    const result = await markAsPrimaryAction({
      contact_id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
    });
    expect(result.ok).toBe(true);

    const unsetUpdate = state.updates.find(
      (u) =>
        u.table === 'contacts' && u.patch.is_primary === false && u.filter === 'is_primary=true',
    );
    const setUpdate = state.updates.find(
      (u) =>
        u.table === 'contacts' &&
        u.patch.is_primary === true &&
        u.filter === 'id=cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
    );
    expect(unsetUpdate).toBeDefined();
    expect(setUpdate).toBeDefined();
  });

  it('toggleLifecycleAction updates + calls Brevo list membership when brevo_contact_id present', async () => {
    const state = makeState({
      contactById: {
        'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': {
          id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
          company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          brevo_contact_id: '777',
          lifecycle_emails_enabled: true,
        },
      },
    });
    mockEnv(state);
    // Brevo list add/remove returns 204
    global.fetch = vi.fn().mockResolvedValue({
      status: 204,
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const { toggleLifecycleAction } = await import('./admin-actions');
    const result = await toggleLifecycleAction({
      contact_id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
      enabled: false,
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find(
      (u) => u.table === 'contacts' && u.patch.lifecycle_emails_enabled === false,
    );
    expect(update).toBeDefined();
    // Brevo fetch should have been called for /contacts/lists/247/contacts/remove
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      fetchCalls.some((c) => String(c[0]).includes('/contacts/lists/247/contacts/remove')),
    ).toBe(true);
  });

  it('deleteContactAction rejects non-admin (sales role)', async () => {
    const state = makeState({
      profile: { id: 'u-sales', role: 'sales', email: 'sales@x' },
      contactById: {
        'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': {
          id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
          company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          email: 'a@b.com',
        },
      },
    });
    mockEnv(state);

    const { deleteContactAction } = await import('./admin-actions');
    const result = await deleteContactAction({
      contact_id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin/i);
    expect(state.deletes.length).toBe(0);
  });

  it('deleteContactAction refuses to delete contact linked as primary on a prospect', async () => {
    const state = makeState({
      contactById: {
        'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': {
          id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
          company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          email: 'lead@acme.com',
        },
      },
      prospectsByPrimary: { 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': [{ id: 'pr-1' }] },
    });
    mockEnv(state);

    const { deleteContactAction } = await import('./admin-actions');
    const result = await deleteContactAction({
      contact_id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/primary/i);
    expect(state.deletes.length).toBe(0);
  });

  it('deleteContactAction deletes when admin + no prospect link', async () => {
    const state = makeState({
      contactById: {
        'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925': {
          id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
          company_id: '1a3e6756-5fde-476a-a735-72c25f44db6b',
          email: 'lead@acme.com',
        },
      },
    });
    mockEnv(state);
    global.fetch = vi.fn().mockResolvedValue({
      status: 204,
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const { deleteContactAction } = await import('./admin-actions');
    const result = await deleteContactAction({
      contact_id: 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
    });
    expect(result.ok).toBe(true);
    expect(
      state.deletes.find(
        (d) => d.table === 'contacts' && d.filter === 'id=cdf8fbde-e03a-4f36-b8f2-97aae2f0b925',
      ),
    ).toBeDefined();
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect(audit?.payload.action).toBe('delete');
  });
});
