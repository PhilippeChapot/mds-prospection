/**
 * P5.x.23-bis — tests confirmSmartAdd, focus catégorie tarif.
 *
 * Validation :
 *   - mode='new' avec company_category='standard' → INSERT company.category=standard
 *   - mode='new' avec company_category='prs_exhibitor' → INSERT category=prs_exhibitor
 *   - mode='new' sans company_category → fallback 'standard' (Zod default)
 *   - mode='existing' → pas d'INSERT company, category de la société existante préservée
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ENV_BACKUP = { ...process.env };

interface MockState {
  existingCompany?: {
    id: string;
    siren: string | null;
    primary_domain?: string | null;
    alternate_domains?: string[];
  } | null;
  existingContact?: {
    id: string;
    company_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    role: string | null;
    language: string;
    is_primary: boolean;
  } | null;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
}

function mockSupabase(state: MockState) {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        let lastFilter = '';

        const selectChain = () => ({
          eq: (col: string, val: unknown) => {
            lastFilter = `${col}=${val}`;
            return selectChain();
          },
          ilike: (col: string, val: unknown) => {
            lastFilter = `${col}~${val}`;
            return {
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            };
          },
          maybeSingle: () => {
            if (table === 'companies' && lastFilter.startsWith('id=')) {
              return Promise.resolve({
                data: state.existingCompany ?? null,
                error: null,
              });
            }
            if (table === 'contacts' && lastFilter.startsWith('id=')) {
              return Promise.resolve({
                data: state.existingContact ?? null,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single: () => Promise.resolve({ data: null, error: null }),
        });

        builder.select = () => selectChain();
        builder.insert = (payload: Record<string, unknown>) => {
          state.inserts.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: `new-${table}-id` },
                  error: null,
                }),
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: `new-${table}-id` },
                  error: null,
                }),
            }),
            // direct insert (smart_add_attempts) → also support .select().single()
          };
        };
        builder.update = (patch: Record<string, unknown>) => {
          const chain: Record<string, unknown> = {};
          chain.eq = (col: string, val: unknown) => {
            state.updates.push({ table, patch, filter: `${col}=${val}` } as never);
            return chain;
          };
          chain.then = (resolve: (r: unknown) => void) => resolve({ error: null });
          return chain;
        };
        return builder;
      },
    }),
  }));
}

function mockPoleLookup() {
  // Pas vraiment utile si on stubbe findPoleId via la table 'poles' déjà gérée
  // par le mock par défaut (maybeSingle → null). C'est OK car pole_id sera null.
}

function mockBrevoOk() {
  global.fetch = vi.fn().mockResolvedValue({
    status: 201,
    ok: true,
    json: () => Promise.resolve({ id: 999 }),
  } as Response);
}

function makeState(opts: Partial<MockState> = {}): MockState {
  return { inserts: [], updates: [], ...opts };
}

describe('confirmSmartAdd — category (P5.x.23-bis)', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_LIST_PROSPECTION_STANDARD_ID = '247';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPoleLookup();
    mockBrevoOk();
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.BREVO_API_KEY) delete process.env.BREVO_API_KEY;
    if (!ENV_BACKUP.BREVO_LIST_PROSPECTION_STANDARD_ID)
      delete process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('mode=new + company_category=standard → INSERT category=standard', async () => {
    const state = makeState();
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'lead@acme.com',
      company_mode: 'new',
      company_name: 'Acme',
      company_category: 'standard',
      contact_email: 'lead@acme.com',
    });

    const result = await confirmSmartAdd(parsed, 'admin-user-id');
    expect(result.ok).toBe(true);
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert?.payload.category).toBe('standard');
  });

  it('mode=new + company_category=prs_exhibitor → INSERT category=prs_exhibitor', async () => {
    const state = makeState();
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'lead@prs.com',
      company_mode: 'new',
      company_name: 'PRS Co',
      company_category: 'prs_exhibitor',
      contact_email: 'lead@prs.com',
    });

    const result = await confirmSmartAdd(parsed, 'admin-user-id');
    expect(result.ok).toBe(true);
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert?.payload.category).toBe('prs_exhibitor');
  });

  it('mode=new without company_category → fallback to "standard" (not "non_eligible")', async () => {
    const state = makeState();
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'lead@nocat.com',
      company_mode: 'new',
      company_name: 'No Category Co',
      // company_category absent → Zod default 'standard'
      contact_email: 'lead@nocat.com',
    });

    expect(parsed.company_category).toBe('standard');

    const result = await confirmSmartAdd(parsed, 'admin-user-id');
    expect(result.ok).toBe(true);
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert?.payload.category).toBe('standard');
    expect(coInsert?.payload.category).not.toBe('non_eligible');
  });

  it('mode=existing → no company INSERT, existing category preserved', async () => {
    const existingId = 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925';
    const state = makeState({
      existingCompany: { id: existingId, siren: null },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'new-contact@acme.com',
      company_mode: 'existing',
      company_id: existingId,
      contact_email: 'new-contact@acme.com',
    });

    const result = await confirmSmartAdd(parsed, 'admin-user-id');
    expect(result.ok).toBe(true);
    // Aucun INSERT companies (le mode 'existing' ne touche pas à la category)
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // P5.x.23-quater : alternate_domains
  // ---------------------------------------------------------------------------

  it('mode=new with company_alternate_domains → INSERT cleans + filters primary', async () => {
    const state = makeState();
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'multi-domain',
      company_mode: 'new',
      company_name: 'France TV',
      company_primary_domain: 'francetv.fr',
      company_alternate_domains: [
        'https://www.francetelevisions.fr/',
        'francetv.fr', // doublon avec primary → filtré
        'FRANCE.TV',
        'invalid-not-a-domain',
      ],
      contact_email: 'lead@francetv.fr',
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert?.payload.primary_domain).toBe('francetv.fr');
    expect(coInsert?.payload.alternate_domains).toEqual(['francetelevisions.fr', 'france.tv']);
  });

  it('mode=new without alternate_domains → empty array', async () => {
    const state = makeState();
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'no alt',
      company_mode: 'new',
      company_name: 'Solo Co',
      contact_email: 'lead@solo.com',
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    const coInsert = state.inserts.find((i) => i.table === 'companies');
    expect(coInsert?.payload.alternate_domains).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // P5.x.23-ter : contact dedup UPSERT
  // ---------------------------------------------------------------------------

  it('with contact_existing_id → UPDATE path (no INSERT contact)', async () => {
    const companyId = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const contactId = 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925';
    const state = makeState({
      existingCompany: { id: companyId, siren: null },
      existingContact: {
        id: contactId,
        company_id: companyId,
        email: 'lead@acme.com',
        first_name: 'Existing',
        last_name: null, // null → sera enrichi
        phone: '+331',
        role: null, // null → sera enrichi
        language: 'FR',
        is_primary: false,
      },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'update existing',
      company_mode: 'existing',
      company_id: companyId,
      contact_email: 'lead@acme.com',
      contact_first_name: 'Override', // NE doit PAS écraser (existing = 'Existing')
      contact_last_name: 'Newlastname', // enrichit (existing null)
      contact_role: 'CMO', // enrichit (existing null)
      contact_existing_id: contactId,
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    // No contact INSERT
    expect(state.inserts.find((i) => i.table === 'contacts')).toBeUndefined();
    // UPDATE patch n'inclut que les champs vides (COALESCE-in-JS)
    const updates = state.updates.filter((u) => u.table === 'contacts');
    const enrichUpdate = updates.find(
      (u) =>
        (u.patch as Record<string, unknown>).last_name === 'Newlastname' ||
        (u.patch as Record<string, unknown>).role === 'CMO',
    );
    expect(enrichUpdate).toBeDefined();
    const patch = enrichUpdate?.patch as Record<string, unknown>;
    // first_name NE doit PAS être dans le patch (DB déjà 'Existing')
    expect(patch.first_name).toBeUndefined();
    // last_name + role enrichis
    expect(patch.last_name).toBe('Newlastname');
    expect(patch.role).toBe('CMO');
  });

  it('with contact_existing_id + different company_id → reassign company', async () => {
    const oldCo = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const newCo = '5402eb3e-f57d-41aa-b1ac-04a1ebc9f8af';
    const contactId = 'cdf8fbde-e03a-4f36-b8f2-97aae2f0b925';
    const state = makeState({
      existingCompany: { id: newCo, siren: null },
      existingContact: {
        id: contactId,
        company_id: oldCo, // attached to a DIFFERENT company
        email: 'lead@acme.com',
        first_name: 'Joe',
        last_name: 'Doe',
        phone: null,
        role: null,
        language: 'FR',
        is_primary: false,
      },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'reassign',
      company_mode: 'existing',
      company_id: newCo,
      contact_email: 'lead@acme.com',
      contact_existing_id: contactId,
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    const reassignUpdate = state.updates.find(
      (u) => u.table === 'contacts' && (u.patch as Record<string, unknown>).company_id === newCo,
    );
    expect(reassignUpdate).toBeDefined();
  });

  it('without contact_existing_id but email already in DB → returns error (strict anti-doublon)', async () => {
    const state = makeState();
    // Pré-existe : un autre contact avec cet email
    state.existingContact = null; // pas testé via existingContact (par id)
    // On simule via mock spécifique : ilike('email', ...) renvoie un row.
    // Plus simple : on override le mock pour cet append.
    const localState = state;
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: (table: string) => {
          if (table === 'companies') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
              }),
              insert: (payload: Record<string, unknown>) => {
                localState.inserts.push({ table, payload });
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: 'co-new' }, error: null }),
                  }),
                };
              },
            };
          }
          if (table === 'contacts') {
            return {
              select: () => ({
                ilike: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: 'other-contact', company_id: 'other-co' },
                      error: null,
                    }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: () => ({
              select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
            }),
          };
        },
      }),
    }));

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'dup',
      company_mode: 'new',
      company_name: 'Acme',
      contact_email: 'lead@acme.com',
      // pas de contact_existing_id → INSERT path strict
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/déjà utilisé/i);
    }
  });

  // ---------------------------------------------------------------------------
  // P5.x.23-quinquies : auto-add alternate_domain
  // ---------------------------------------------------------------------------

  it('add_alternate_domain=true + mode=existing + domain mismatch → UPDATE alt_domains', async () => {
    const companyId = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const state = makeState({
      existingCompany: {
        id: companyId,
        siren: null,
        primary_domain: 'francetelevisions.fr',
        alternate_domains: [],
      },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'mismatch',
      company_mode: 'existing',
      company_id: companyId,
      contact_email: 'marie@francetv.fr',
      add_alternate_domain: true,
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.alternateDomainAdded).toBe('francetv.fr');

    // L'UPDATE alternate_domains a bien eu lieu sur la company
    const altUpdate = state.updates.find(
      (u) =>
        u.table === 'companies' &&
        Array.isArray((u.patch as Record<string, unknown>).alternate_domains),
    );
    expect(altUpdate).toBeDefined();
    const alts = (altUpdate?.patch as { alternate_domains: string[] }).alternate_domains;
    expect(alts).toEqual(['francetv.fr']);
  });

  it('add_alternate_domain=false → no UPDATE alt_domains', async () => {
    const companyId = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const state = makeState({
      existingCompany: {
        id: companyId,
        siren: null,
        primary_domain: 'francetelevisions.fr',
        alternate_domains: [],
      },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'mismatch but unchecked',
      company_mode: 'existing',
      company_id: companyId,
      contact_email: 'marie@francetv.fr',
      add_alternate_domain: false,
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.alternateDomainAdded).toBeNull();

    const altUpdate = state.updates.find(
      (u) =>
        u.table === 'companies' &&
        Array.isArray((u.patch as Record<string, unknown>).alternate_domains),
    );
    expect(altUpdate).toBeUndefined();
  });

  it('idempotent : domain already in alternate_domains → no duplicate, no UPDATE', async () => {
    const companyId = '1a3e6756-5fde-476a-a735-72c25f44db6b';
    const state = makeState({
      existingCompany: {
        id: companyId,
        siren: null,
        primary_domain: 'francetelevisions.fr',
        alternate_domains: ['francetv.fr'], // déjà présent
      },
    });
    mockSupabase(state);

    const { confirmSchema, confirmSmartAdd } = await import('./orchestrator');
    const parsed = confirmSchema.parse({
      raw_input: 'race',
      company_mode: 'existing',
      company_id: companyId,
      contact_email: 'lead@francetv.fr',
      add_alternate_domain: true, // checkbox cochée mais rien à faire
    });

    const result = await confirmSmartAdd(parsed, 'admin');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.alternateDomainAdded).toBeNull();

    // Pas d'UPDATE alternate_domains
    const altUpdate = state.updates.find(
      (u) =>
        u.table === 'companies' &&
        Array.isArray((u.patch as Record<string, unknown>).alternate_domains),
    );
    expect(altUpdate).toBeUndefined();
  });
});
