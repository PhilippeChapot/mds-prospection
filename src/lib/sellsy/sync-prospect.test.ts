import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ----- Mocks pour les dependances externes -----

// Mock Supabase service client : on remplace par une version en memoire
// minimaliste qui retourne un fixture prospect via .from(...).select(...).
const mockSupabaseClient = {
  prospect: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; id?: string }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  from(table: string) {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'prospects'
              ? { data: mockSupabaseClient.prospect, error: null }
              : { data: null, error: null },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          mockSupabaseClient.updates.push({ table, values, id });
          return { error: null };
        },
      }),
      insert: async (values: Record<string, unknown>) => {
        mockSupabaseClient.inserts.push({ table, values });
        return { error: null };
      },
    };
  },
};

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => mockSupabaseClient,
}));

// Mock sellsyFetch (le helper qui parle a l'API Sellsy).
const mockSellsyFetch = vi.fn();
vi.mock('@/lib/sellsy/client', () => {
  class SellsyErrorMock extends Error {
    status: number;
    body: unknown;
    path: string;
    constructor(message: string, status: number, path: string, body: unknown) {
      super(message);
      this.name = 'SellsyError';
      this.status = status;
      this.path = path;
      this.body = body;
    }
  }
  return {
    sellsyFetch: (path: string, options?: unknown) => mockSellsyFetch(path, options),
    SellsyError: SellsyErrorMock,
  };
});

// Helper local pour construire l'erreur Sellsy (réutilise la classe du mock).
async function makeSellsyError(
  message: string,
  status: number,
  path: string,
  body: unknown,
): Promise<Error> {
  const mod = (await import('@/lib/sellsy/client')) as unknown as {
    SellsyError: new (m: string, s: number, p: string, b: unknown) => Error;
  };
  return new mod.SellsyError(message, status, path, body);
}

// L'import doit venir APRES les mocks.
import { syncProspectToSellsy, _resetSellsyPipelineCacheForTests } from './sync-prospect';

// Helper : mock typique du fetch GET pipelines/.../steps avant un POST /opportunities.
// Step "Lead" (id 9999) du pipeline 775 par defaut. A inserer JUSTE AVANT le mock
// du POST /opportunities dans la sequence mockResolvedValueOnce.
function mockStepsFetch(stepId = 9999) {
  return {
    data: [{ id: stepId, display_order: 1, name: 'Lead' }],
  };
}

// ----- Fixtures -----

function makeProspect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'prospect-uuid-1',
    is_test: false,
    estimated_amount: 5000,
    source_detail: 'signup abc',
    sellsy_opportunity_id: null,
    company: {
      id: 'company-uuid-1',
      name: 'NRJ Group',
      primary_domain: 'nrj.fr',
      sellsy_id: null,
    },
    contact: {
      id: 'contact-uuid-1',
      first_name: 'Jean',
      last_name: 'Dupont',
      email: 'jean@nrj.fr',
      phone: '+33612345678',
      sellsy_contact_id: null,
    },
    ...overrides,
  };
}

// ----- Tests -----

describe('syncProspectToSellsy', () => {
  beforeEach(() => {
    mockSupabaseClient.prospect = null;
    mockSupabaseClient.updates = [];
    mockSupabaseClient.inserts = [];
    mockSellsyFetch.mockReset();
    // Reset le cache du step pipeline pour que chaque test soit isole.
    _resetSellsyPipelineCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips entirely when is_test=true', async () => {
    mockSupabaseClient.prospect = makeProspect({ is_test: true });

    await syncProspectToSellsy('prospect-uuid-1');

    expect(mockSellsyFetch).not.toHaveBeenCalled();
    expect(mockSupabaseClient.updates).toHaveLength(0);
  });

  it('finds existing company by exact name match (no create)', async () => {
    mockSupabaseClient.prospect = makeProspect();
    mockSellsyFetch
      // 1. company search exact -> found exact match
      .mockResolvedValueOnce({ data: [{ id: 5001, name: 'NRJ Group' }] })
      // 2. individual search by email -> not found
      .mockResolvedValueOnce({ data: [] })
      // 3. individual create
      .mockResolvedValueOnce({ data: { id: 7001 } })
      // 4. pipeline steps fetch (1er sync, cache vide)
      .mockResolvedValueOnce(mockStepsFetch())
      // 5. opportunity create
      .mockResolvedValueOnce({ data: { id: 9001 } });

    await syncProspectToSellsy('prospect-uuid-1');

    // 5 fetches : search exact, search individual, create individual, steps fetch, create opportunity.
    expect(mockSellsyFetch).toHaveBeenCalledTimes(5);
    const createCompanyCall = mockSellsyFetch.mock.calls.find(
      ([path, options]) =>
        path === '/companies' && (options as { method?: string })?.method === 'POST',
    );
    expect(createCompanyCall).toBeUndefined();

    const tablesUpdated = mockSupabaseClient.updates.map((u) => u.table);
    expect(tablesUpdated).toContain('companies');
    expect(tablesUpdated).toContain('contacts');
    expect(tablesUpdated.filter((t) => t === 'prospects').length).toBeGreaterThanOrEqual(2);
  });

  it('matches company by prefix when MDS name is more complete than Sellsy', async () => {
    // Cas reel : MDS = "21 Juin Production", Sellsy = "21 Juin" (id 52457).
    mockSupabaseClient.prospect = makeProspect({
      company: {
        id: 'company-uuid-2',
        name: '21 Juin Production',
        primary_domain: '21juin.fr',
        sellsy_id: null,
      },
    });
    mockSellsyFetch
      // 1. exact search "21 Juin Production" -> 0 result
      .mockResolvedValueOnce({ data: [] })
      // 2. prefix search "21 Juin" -> 1 result "21 Juin"
      .mockResolvedValueOnce({ data: [{ id: 52457, name: '21 Juin' }] })
      // 3. individual search -> empty
      .mockResolvedValueOnce({ data: [] })
      // 4. individual create
      .mockResolvedValueOnce({ data: { id: 7001 } })
      // 5. pipeline steps fetch
      .mockResolvedValueOnce(mockStepsFetch())
      // 6. opportunity create
      .mockResolvedValueOnce({ data: { id: 9001 } });

    await syncProspectToSellsy('prospect-uuid-1');

    // Aucun POST /companies create (match-by-prefix a fonctionne).
    const createCompanyCall = mockSellsyFetch.mock.calls.find(
      ([path, options]) =>
        path === '/companies' && (options as { method?: string })?.method === 'POST',
    );
    expect(createCompanyCall).toBeUndefined();

    // companies.sellsy_id mis a jour avec l'id Sellsy retrouve.
    const companyUpdate = mockSupabaseClient.updates.find((u) => u.table === 'companies');
    expect(companyUpdate?.values.sellsy_id).toBe('52457');
  });

  it('records manual-match-needed error when prefix returns multiple candidates', async () => {
    mockSupabaseClient.prospect = makeProspect({
      company: {
        id: 'company-uuid-3',
        name: 'Radio France International',
        primary_domain: 'rfi.fr',
        sellsy_id: null,
      },
    });
    mockSellsyFetch
      // 1. exact search -> 0
      .mockResolvedValueOnce({ data: [] })
      // 2. prefix "Radio France" -> 2 candidats (homonymes)
      .mockResolvedValueOnce({
        data: [
          { id: 1001, name: 'Radio France International' },
          { id: 1002, name: 'Radio France Inter' },
        ],
      });

    await syncProspectToSellsy('prospect-uuid-1');

    // SellsyManualMatchNeededError = status 409 = NOT retryable -> 1 seul cycle.
    // Le retry n'insiste pas. UPDATE prospects last_sync_error_message ecrit.
    const errorUpdate = mockSupabaseClient.updates.find(
      (u) =>
        u.table === 'prospects' &&
        (u.values.last_sync_error_provider as string | undefined) === 'sellsy',
    );
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate?.values.last_sync_error_message).toContain('Plusieurs sociétés');
  });

  it('creates company when no match found', async () => {
    mockSupabaseClient.prospect = makeProspect();
    mockSellsyFetch
      // 1. exact search -> 0
      .mockResolvedValueOnce({ data: [] })
      // 2. prefix search -> 0
      .mockResolvedValueOnce({ data: [] })
      // 3. POST /companies create
      .mockResolvedValueOnce({ data: { id: 5002 } })
      // 4. individual search -> empty
      .mockResolvedValueOnce({ data: [] })
      // 5. POST /individuals create
      .mockResolvedValueOnce({ data: { id: 7002 } })
      // 6. pipeline steps fetch
      .mockResolvedValueOnce(mockStepsFetch())
      // 7. POST /opportunities create
      .mockResolvedValueOnce({ data: { id: 9002 } });

    await syncProspectToSellsy('prospect-uuid-1');

    expect(mockSellsyFetch).toHaveBeenCalledTimes(7);
    const createCompanyCall = mockSellsyFetch.mock.calls.find(
      ([path, options]) =>
        path === '/companies' && (options as { method?: string })?.method === 'POST',
    );
    expect(createCompanyCall).toBeDefined();
  });

  it('P6.x.6 — gère collision email collaborateur Sellsy : individual skip + sync OK', async () => {
    // Cas réel observé sur prospect Editions HF : POST /individuals renvoie
    // 400 avec details.email = "...déjà utilisée sur l'un de vos collaborateurs"
    // car l'email du contact existe déjà comme staff Sellsy. La sync doit
    // continuer sans contact_id et marquer la sync comme OK (reset error fields).
    mockSupabaseClient.prospect = makeProspect();
    mockSellsyFetch
      // 1. company search exact -> found
      .mockResolvedValueOnce({ data: [{ id: 5001, name: 'NRJ Group' }] })
      // 2. individual search by email -> empty (les staff n'y figurent pas)
      .mockResolvedValueOnce({ data: [] })
      // 3. POST /individuals -> 400 collaborator collision
      .mockRejectedValueOnce(
        await makeSellsyError('Sellsy fetch /individuals failed (400)', 400, '/individuals', {
          error: {
            code: 400,
            message: 'Validations errors',
            details: {
              email: "Cette adresse email est déjà utilisée sur l'un de vos collaborateurs",
            },
          },
        }),
      )
      // 4. pipeline steps fetch
      .mockResolvedValueOnce(mockStepsFetch())
      // 5. opportunity create
      .mockResolvedValueOnce({ data: { id: 9001 } });

    await syncProspectToSellsy('prospect-uuid-1');

    // Sync OK final : pas de last_sync_error_provider posé sur prospects.
    const errorUpdate = mockSupabaseClient.updates.find(
      (u) =>
        u.table === 'prospects' &&
        (u.values.last_sync_error_provider as string | undefined) === 'sellsy',
    );
    expect(errorUpdate).toBeUndefined();

    // Reset des error fields en fin de flow (last_synced_sellsy_at bumped).
    const successUpdate = mockSupabaseClient.updates.find(
      (u) => u.table === 'prospects' && u.values.last_synced_sellsy_at !== undefined,
    );
    expect(successUpdate).toBeDefined();
    expect(successUpdate?.values.last_sync_error_message).toBeNull();

    // contact.sellsy_contact_id reste null (pas d'individual Sellsy attaché).
    const contactUpdate = mockSupabaseClient.updates.find((u) => u.table === 'contacts');
    expect(contactUpdate?.values.sellsy_contact_id).toBeNull();
  });

  it('records error in DB after final retry exhaustion (5xx)', async () => {
    mockSupabaseClient.prospect = makeProspect();
    // Toutes les attempts echouent avec 503.
    const error = Object.assign(new Error('Sellsy 503'), { status: 503 });
    mockSellsyFetch.mockRejectedValue(error);

    // Override backoff pour le test (rapide). On modifie via spy ?
    // En fait withExponentialRetry utilise des sleep — on accepte que le test
    // dure ~21s. Pour eviter, on peut bypass via fake timers.
    vi.useFakeTimers();
    const promise = syncProspectToSellsy('prospect-uuid-1');
    // Avancer le temps pour skip les sleeps de retry.
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;
    vi.useRealTimers();

    // 4 attempts au minimum (1 initial + 3 retries). Chaque attempt peut faire
    // plusieurs fetches selon le step ou l'erreur survient (ici search company
    // by website -> catch + retombe sur search by name qui throw -> retry).
    expect(mockSellsyFetch.mock.calls.length).toBeGreaterThanOrEqual(4);

    // UPDATE prospect avec last_sync_error_message + provider='sellsy'.
    const errorUpdate = mockSupabaseClient.updates.find(
      (u) =>
        u.table === 'prospects' &&
        (u.values.last_sync_error_provider as string | undefined) === 'sellsy',
    );
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate?.values.last_sync_error_message).toContain('Sellsy 503');
  }, 30_000);
});
