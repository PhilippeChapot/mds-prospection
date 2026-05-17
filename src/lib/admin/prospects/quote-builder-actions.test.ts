/**
 * @vitest-environment node
 *
 * P6.x.5 / P6.x.5-ter — tests server actions Devis Builder.
 *
 * Couvre :
 *   - saveQuoteDraftAction :
 *       * refuse non admin/sales
 *       * happy path UPDATE quote_items + promo_reason + estimated_amount
 *         (PAS pack_code/selected_addon_ids, cf. Option A P6.x.5-bis)
 *       * Zod : discount_pct accepté par item, default 0
 *       * PREMIUM avec discount_pct → forcé à 0 côté DB (defensive clamp)
 *   - emitSellsyDevisFromQuoteBuilderAction :
 *       * refuse non admin
 *       * refuse si items vides
 *       * happy path : POST /estimates avec row.discount par ligne
 *         (unit:'percent', value), unit_amount = prix catalogue
 *       * PREMIUM : row sans champ discount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ProspectStub {
  id: string;
  quote_items: unknown;
  promo_reason: string | null;
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

const PACK_STD = {
  sellsy_product_id: 1,
  reference: 'MDS-PACK-STD-ACCESS-PARIS',
  name: 'Pack ACCESS Standard',
  unit_price_ht: 12500,
  qty: 1,
  category: 'pack',
  sub_category: 'standard' as string | null,
  is_premium: false,
  discount_pct: 0,
};
const SPONSOR = {
  sellsy_product_id: 3,
  reference: 'MDS-ADDON-LOGO-GOLD-PARIS',
  name: 'Logo Gold',
  unit_price_ht: 3000,
  qty: 1,
  category: 'sponsor',
  sub_category: 'or' as string | null,
  is_premium: false,
  discount_pct: 0,
};
const PACK_PREMIUM = {
  sellsy_product_id: 2,
  reference: 'MDS-PACK-PREMIUM-PARIS',
  name: 'Pack PREMIUM',
  unit_price_ht: 25000,
  qty: 1,
  category: 'pack',
  sub_category: 'premium' as string | null,
  is_premium: true,
  discount_pct: 0,
};

describe('saveQuoteDraftAction (P6.x.5-ter)', () => {
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

  it("refuse l'accès si role 'viewer'", async () => {
    state.profileRole = 'viewer';
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [PACK_STD],
      promo_reason: null,
    });
    expect(r.ok).toBe(false);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('happy path : update quote_items + promo_reason + estimated_amount (PAS pack_code)', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [
        { ...PACK_STD, discount_pct: 30 }, // 12500 * 0.7 = 8750
        { ...SPONSOR, discount_pct: 10 }, // 3000 * 0.9 = 2700
      ],
      promo_reason: 'Tarif Institutionnel UDECAM',
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates).toHaveLength(1);
    const upd = state.prospectUpdates[0];
    expect(upd.promo_reason).toBe('Tarif Institutionnel UDECAM');
    expect(upd).not.toHaveProperty('pack_code');
    expect(upd).not.toHaveProperty('selected_addon_ids');
    expect(upd).not.toHaveProperty('promo_pct');
    expect(upd).not.toHaveProperty('promo_excludes_premium');
    // total_ht = 15500 - 3750 - 300 = 11450
    expect(upd.estimated_amount).toBe(11450);
    // quote_items contient bien les discount_pct
    const savedItems = upd.quote_items as Array<{
      discount_pct: number;
      sellsy_product_id: number;
    }>;
    expect(savedItems[0].discount_pct).toBe(30);
    expect(savedItems[1].discount_pct).toBe(10);
  });

  it('Zod : discount_pct accepté par item, default 0 si absent', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    // Cas sans discount_pct → default 0
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [
        // @ts-expect-error volontaire — on teste le default Zod
        { ...PACK_STD, discount_pct: undefined },
      ],
      promo_reason: null,
    });
    expect(r.ok).toBe(true);
    const savedItems = state.prospectUpdates[0].quote_items as Array<{ discount_pct: number }>;
    expect(savedItems[0].discount_pct).toBe(0);
  });

  it('PREMIUM avec discount_pct=50 dans payload → forcé à 0 côté DB (defensive clamp)', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [{ ...PACK_PREMIUM, discount_pct: 50 }],
      promo_reason: null,
    });
    expect(r.ok).toBe(true);
    const savedItems = state.prospectUpdates[0].quote_items as Array<{ discount_pct: number }>;
    expect(savedItems[0].discount_pct).toBe(0);
    // total_ht = prix plein 25000 (pas de remise PREMIUM)
    expect(state.prospectUpdates[0].estimated_amount).toBe(25000);
  });

  it('Zod : discount_pct > 100 refusé', async () => {
    mockEnv();
    const { saveQuoteDraftAction } = await import('./quote-builder-actions');
    const r = await saveQuoteDraftAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [{ ...PACK_STD, discount_pct: 150 }],
      promo_reason: null,
    });
    expect(r.ok).toBe(false);
  });
});

describe('emitSellsyDevisFromQuoteBuilderAction (P6.x.5-ter)', () => {
  beforeEach(() => {
    state.profileRole = 'admin';
    state.prospect = {
      id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [
        { ...PACK_STD, discount_pct: 30 },
        { ...SPONSOR, discount_pct: 10 },
      ],
      promo_reason: 'Tarif Institutionnel UDECAM',
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
            amounts: { total: '13740.00', total_excl_tax: '11450.00' },
            public_link_enabled: true,
            public_link: 'https://sellsy.example/d/555',
          },
        },
      ],
    ]);
    state.sellsyCalls = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
  });

  it('P6.x.5-ter — POST /estimates avec row.discount structuré par ligne (unit_amount = catalogue)', async () => {
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total_ht).toBe(11450);

    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/estimates');
    expect(post).toBeDefined();
    const body = JSON.parse(post!.body!) as {
      rows: Array<{
        unit_amount: string;
        related: { id: number };
        discount?: { unit: 'percent'; value: number };
      }>;
      note?: string;
    };
    // unit_amount = prix catalogue (Sellsy calcule la remise lui-même)
    expect(body.rows[0].unit_amount).toBe('12500.00');
    expect(body.rows[1].unit_amount).toBe('3000.00');
    // row.discount structuré présent sur les 2 lignes
    expect(body.rows[0].discount).toEqual({ unit: 'percent', value: 30 });
    expect(body.rows[1].discount).toEqual({ unit: 'percent', value: 10 });
    // Note Sellsy contient la justification + détail
    expect(body.note).toMatch(/Tarif Institutionnel UDECAM/);
    expect(body.note).toMatch(/Pack ACCESS Standard : -30%/);
    expect(body.note).toMatch(/Logo Gold : -10%/);
  });

  it('PREMIUM dans items → row SANS champ discount (Sellsy reçoit prix plein)', async () => {
    state.prospect!.quote_items = [
      { ...PACK_PREMIUM, discount_pct: 50 }, // PREMIUM, ignoré par clamp
      { ...SPONSOR, discount_pct: 20 },
    ];
    state.prospect!.promo_reason = null;
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/estimates');
    const body = JSON.parse(post!.body!) as {
      rows: Array<{ unit_amount: string; discount?: unknown }>;
    };
    // PREMIUM = pas de discount, prix plein 25000
    expect(body.rows[0].unit_amount).toBe('25000.00');
    expect(body.rows[0].discount).toBeUndefined();
    // SPONSOR = discount appliqué
    expect(body.rows[1].discount).toEqual({ unit: 'percent', value: 20 });
  });
});
