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
  existingCompany?: { id: string; siren: string | null } | null;
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
});
