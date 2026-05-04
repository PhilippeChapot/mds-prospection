import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ----- Mocks pour les dependances externes -----

// Mock Supabase service client : on remplace par une version en memoire
// minimaliste qui retourne un fixture prospect via .from(...).select(...).
const mockSupabaseClient = {
  prospect: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; id?: string }>,
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
    };
  },
};

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => mockSupabaseClient,
}));

// Mock sellsyFetch (le helper qui parle a l'API Sellsy).
const mockSellsyFetch = vi.fn();
vi.mock('@/lib/sellsy/client', () => ({
  sellsyFetch: (path: string, options?: unknown) => mockSellsyFetch(path, options),
}));

// L'import doit venir APRES les mocks.
import { syncProspectToSellsy } from './sync-prospect';

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
    mockSellsyFetch.mockReset();
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

  it('finds existing company by website (no create)', async () => {
    mockSupabaseClient.prospect = makeProspect();
    mockSellsyFetch
      // 1. company search by website -> found
      .mockResolvedValueOnce({ data: [{ id: 5001, name: 'NRJ Group' }] })
      // 2. individual search by email -> not found
      .mockResolvedValueOnce({ data: [] })
      // 3. individual create
      .mockResolvedValueOnce({ data: { id: 7001 } })
      // 4. opportunity create
      .mockResolvedValueOnce({ data: { id: 9001 } });

    await syncProspectToSellsy('prospect-uuid-1');

    // 4 fetches : search company, search individual, create individual, create opportunity.
    expect(mockSellsyFetch).toHaveBeenCalledTimes(4);
    // Aucun POST /companies (find by domain a marche).
    const createCompanyCall = mockSellsyFetch.mock.calls.find(
      ([path, options]) =>
        path === '/companies' && (options as { method?: string })?.method === 'POST',
    );
    expect(createCompanyCall).toBeUndefined();

    // UPDATE companies (sellsy_id) + UPDATE contacts + UPDATE prospects (opp_id) +
    // UPDATE prospects (last_synced + clear errors).
    const tablesUpdated = mockSupabaseClient.updates.map((u) => u.table);
    expect(tablesUpdated).toContain('companies');
    expect(tablesUpdated).toContain('contacts');
    expect(tablesUpdated.filter((t) => t === 'prospects').length).toBeGreaterThanOrEqual(2);
  });

  it('creates company + individual + opportunity when none exist', async () => {
    mockSupabaseClient.prospect = makeProspect();
    mockSellsyFetch
      // 1. company search by website -> empty
      .mockResolvedValueOnce({ data: [] })
      // 2. company search by name -> empty
      .mockResolvedValueOnce({ data: [] })
      // 3. POST /companies create
      .mockResolvedValueOnce({ data: { id: 5002 } })
      // 4. individual search -> empty
      .mockResolvedValueOnce({ data: [] })
      // 5. POST /individuals create
      .mockResolvedValueOnce({ data: { id: 7002 } })
      // 6. POST /opportunities create
      .mockResolvedValueOnce({ data: { id: 9002 } });

    await syncProspectToSellsy('prospect-uuid-1');

    // 6 fetches au total.
    expect(mockSellsyFetch).toHaveBeenCalledTimes(6);

    // Verifier qu'on a bien POST /companies (create).
    const createCompanyCall = mockSellsyFetch.mock.calls.find(
      ([path, options]) =>
        path === '/companies' && (options as { method?: string })?.method === 'POST',
    );
    expect(createCompanyCall).toBeDefined();
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
