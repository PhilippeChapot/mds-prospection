/**
 * @vitest-environment node
 *
 * P6.x.5 — tests server actions Devis Builder.
 *
 * Couvre :
 *   - saveQuoteDraftAction : refus si non admin/sales, happy path update DB
 *     + hydratation pack_code/selected_addon_ids/estimated_amount
 *   - emitSellsyDevisFromQuoteBuilderAction : refus si non admin, refus si
 *     items vides, happy path crée Sellsy estimate avec unit_amount remisé,
 *     note Sellsy contient promo_reason, update prospects.sellsy_devis_id
 *     + status='devis_envoye'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ProspectStub {
  id: string;
  quote_items: unknown;
  promo_pct: number;
  promo_reason: string | null;
  promo_excludes_premium: boolean;
  sellsy_devis_id: string | null;
  company: { id: string; sellsy_id: number | null };
  contact: { sellsy_contact_id: number | null } | null;
  status: 'lead' | 'devis_envoye' | string;
}

interface MockState {
  profileRole: 'admin' | 'sales' | 'viewer';
  prospect: ProspectStub | null;
  companySellsyIdPostSync: number | null;
  prospectUpdates: Array<Record<string, unknown>>;
  prospectStatusUpdate: Record<string, unknown> | null;
  sellsyResponses: Map<string, unknown>;
  sellsyCalls: Array<{ endpoint: string; method: string; body?: string }>;
}

const state: MockState = {
  profileRole: 'admin',
  prospect: null,
  companySellsyIdPostSync: null,
  prospectUpdates: [],
  prospectStatusUpdate: null,
  sellsyResponses: new Map(),
  sellsyCalls: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'u', role: state.profileRole, email: 'x@y' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.prospect,
                    error: state.prospect ? null : { message: 'not found' },
                  }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, _val: string) => ({
                eq: (_col2: string, _val2: string) => {
                  state.prospectStatusUpdate = patch;
                  return Promise.resolve({ error: null });
                },
                then: (resolve: (r: { error: null }) => void) => {
                  state.prospectUpdates.push(patch);
                  resolve({ error: null });
                },
              }),
            }),
          };
        }
        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { sellsy_id: state.companySellsyIdPostSync },
                    error: null,
                  }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));

  vi.doMock('@/lib/sellsy/sync-prospect', () => ({
    syncProspectToSellsy: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock('@/lib/sellsy/client', () => ({
    sellsyFetch: vi.fn(async (endpoint: string, opts?: { method?: string; body?: string }) => {
      state.sellsyCalls.push({
        endpoint,
        method: opts?.method ?? 'GET',
        body: opts?.body,
      });
      return state.sellsyResponses.get(`${opts?.method ?? 'GET'} ${endpoint}`) ?? {};
    }),
  }));

  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
}

const VALID_ITEMS = [
  {
    sellsy_product_id: 1,
    reference: 'MDS-PACK-STD-ACCESS-PARIS',
    name: 'Pack ACCESS Standard',
    unit_price_ht: 12500,
    qty: 1,
    category: 'pack',
    sub_category: 'standard',
    is_premium: false,
  },
  {
    sellsy_product_id: 3,
    reference: 'MDS-ADDON-LOGO-GOLD-PARIS',
    name: 'Logo Gold',
    unit_price_ht: 3000,
    qty: 1,
    category: 'sponsor',
    sub_category: 'or',
    is_premium: false,
  },
];

describe('saveQuoteDraftAction (P6.x.5)', () => {
  beforeEach(() => {
    state.profileRole = 'admin';
    state.prospect = null;
    state.companySellsyIdPostSync = null;
    state.prospectUpdates = [];
    state.prospectStatusUpdate = null;
    state.sellsyResponses = new Map();
    state.sellsyCalls = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("refuse l'accès si role 'viewer' (Forbidden)", async () => {
    state.profileRole = 'viewer';
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: VALID_ITEMS,
      promo_pct: 30,
      promo_reason: 'Test',
      promo_excludes_premium: true,
    });
    expect(r.ok).toBe(false);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('happy path : update DB + hydrate pack_code + estimated_amount = total_ht remisé', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: VALID_ITEMS,
      promo_pct: 30,
      promo_reason: 'Tarif Institutionnel UDECAM',
      promo_excludes_premium: true,
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates).toHaveLength(1);
    const upd = state.prospectUpdates[0];
    expect(upd.promo_pct).toBe(30);
    expect(upd.promo_reason).toBe('Tarif Institutionnel UDECAM');
    expect(upd.promo_excludes_premium).toBe(true);
    expect(upd.pack_code).toBe('standard'); // hydraté depuis premier pack
    expect(upd.selected_addon_ids).toEqual(['3']);
    // total_ht = 15500 - 30% = 10850
    expect(upd.estimated_amount).toBe(10850);
  });

  it('Zod : promo_pct > 100 refusé', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: VALID_ITEMS,
      promo_pct: 150,
      promo_reason: null,
      promo_excludes_premium: true,
    });
    expect(r.ok).toBe(false);
  });
});

describe('emitSellsyDevisFromQuoteBuilderAction (P6.x.5)', () => {
  beforeEach(() => {
    state.profileRole = 'admin';
    state.prospect = {
      id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: VALID_ITEMS,
      promo_pct: 30,
      promo_reason: 'Tarif Institutionnel UDECAM',
      promo_excludes_premium: true,
      sellsy_devis_id: null,
      company: { id: 'co-1', sellsy_id: null },
      contact: null,
      status: 'lead',
    };
    state.companySellsyIdPostSync = 9999;
    state.prospectUpdates = [];
    state.prospectStatusUpdate = null;
    state.sellsyResponses = new Map([
      ['POST /estimates', { data: { id: 555 } }],
      [
        'GET /estimates/555',
        {
          data: {
            number: 'F-2026-001',
            amounts: { total: '13020.00', total_excl_tax: '10850.00' },
            public_link_enabled: true,
            public_link: 'https://sellsy.example/d/555',
          },
        },
      ],
    ]);
    state.sellsyCalls = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // garde console.error pour debug
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse si role sales (admin only)', async () => {
    state.profileRole = 'sales';
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(false);
    expect(state.sellsyCalls).toHaveLength(0);
  });

  it('refuse si quote_items vide', async () => {
    state.prospect!.quote_items = [];
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/aucun produit/i);
  });

  it('happy path : POST /estimates avec rows unit_amount remisé + note + update prospect', async () => {
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sellsy_devis_id).toBe('555');
      expect(r.sellsy_devis_number).toBe('F-2026-001');
      expect(r.total_ht).toBe(10850);
    }

    // POST /estimates appelé avec rows remisés (12500*0.7=8750 et 3000*0.7=2100)
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/estimates');
    expect(post).toBeDefined();
    const body = JSON.parse(post!.body!) as {
      rows: Array<{ unit_amount: string; quantity: string; related: { id: number } }>;
      note?: string;
      public_link_enabled: boolean;
      related: Array<{ id: number }>;
    };
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].unit_amount).toBe('8750.00');
    expect(body.rows[1].unit_amount).toBe('2100.00');
    expect(body.related[0].id).toBe(9999);
    expect(body.public_link_enabled).toBe(true);
    expect(body.note).toMatch(/Tarif Institutionnel UDECAM/);

    // Update prospect avec sellsy_devis_*
    const devisUpd = state.prospectUpdates.find((u) => 'sellsy_devis_id' in u);
    expect(devisUpd).toBeDefined();
    expect(devisUpd?.sellsy_devis_id).toBe('555');
    expect(devisUpd?.sellsy_devis_number).toBe('F-2026-001');
    expect(devisUpd?.estimated_amount).toBe(10850);

    // Status passage lead → devis_envoye (filtré par .eq('status','lead'))
    expect(state.prospectStatusUpdate).toMatchObject({ status: 'devis_envoye' });
  });

  it('PREMIUM avec exclusion : unit_amount du PREMIUM = prix plein', async () => {
    state.prospect!.quote_items = [
      {
        sellsy_product_id: 2,
        reference: 'MDS-PACK-PREMIUM-PARIS',
        name: 'Pack PREMIUM',
        unit_price_ht: 25000,
        qty: 1,
        category: 'pack',
        sub_category: 'premium',
        is_premium: true,
      },
      VALID_ITEMS[1],
    ];
    state.prospect!.promo_reason = null;
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/estimates');
    const body = JSON.parse(post!.body!) as {
      rows: Array<{ unit_amount: string }>;
      note?: string;
    };
    expect(body.rows[0].unit_amount).toBe('25000.00'); // PREMIUM pas remisé
    expect(body.rows[1].unit_amount).toBe('2100.00'); // Sponsor remisé
    // Sans promo_reason, note auto -X%
    expect(body.note).toMatch(/-30%/);
  });
});
