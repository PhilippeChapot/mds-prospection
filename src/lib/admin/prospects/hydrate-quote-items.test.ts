/**
 * @vitest-environment node
 *
 * P6.x.5-octies — tests hydrateQuoteItemsFromSelection + resolvePackReference.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePackReference } from './hydrate-quote-items';

describe('resolvePackReference (P6.x.5-octies)', () => {
  it('ACCESS + standard → MDS-PACK-STD-ACCESS-PARIS', () => {
    expect(resolvePackReference('ACCESS', ['paris'], 'standard')).toBe('MDS-PACK-STD-ACCESS-PARIS');
  });

  it('CLASSIC + prs_exhibitor → MDS-PACK-PRSEXH-CLASSIC-PARIS', () => {
    expect(resolvePackReference('CLASSIC', ['paris'], 'prs_exhibitor')).toBe(
      'MDS-PACK-PRSEXH-CLASSIC-PARIS',
    );
  });

  it('PREMIUM + events_interest avec marseille → reste PARIS (doctrine v1)', () => {
    // Pas de pack MARSEILLE dans le catalogue Sellsy — Marseille est un
    // supplement séparé. On retombe systématiquement sur PARIS.
    expect(resolvePackReference('PREMIUM', ['paris', 'marseille'], 'standard')).toBe(
      'MDS-PACK-STD-PREMIUM-PARIS',
    );
  });

  it('categorie absent → fallback STD', () => {
    expect(resolvePackReference('ACCESS', ['paris'], null)).toBe('MDS-PACK-STD-ACCESS-PARIS');
    expect(resolvePackReference('ACCESS', ['paris'])).toBe('MDS-PACK-STD-ACCESS-PARIS');
  });

  it('A_DEFINIR / null / valeur invalide → null', () => {
    expect(resolvePackReference('A_DEFINIR', ['paris'], 'standard')).toBeNull();
    expect(resolvePackReference(null, ['paris'], 'standard')).toBeNull();
    expect(resolvePackReference('UNKNOWN', ['paris'], 'standard')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hydrateQuoteItemsFromSelection — tests d'intégration avec Supabase mocké
// ---------------------------------------------------------------------------

interface SellsyMirrorRow {
  sellsy_item_id: number;
  reference: string;
  name: string;
  price_excl_tax: number;
}
interface EditorialRow {
  category: string;
  sub_category: string | null;
}
interface AddonRow {
  id: string;
  code: string;
  sellsy_item_id: number | null;
}

interface MockState {
  sellsyByReference: Map<string, SellsyMirrorRow>;
  sellsyById: Map<number, SellsyMirrorRow>;
  editorialByProductId: Map<number, EditorialRow>;
  addonsById: Map<string, AddonRow>;
}

const state: MockState = {
  sellsyByReference: new Map(),
  sellsyById: new Map(),
  editorialByProductId: new Map(),
  addonsById: new Map(),
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'sellsy_products_mirror') {
          return {
            select: () => ({
              eq: (col: string, val: string | number) => ({
                maybeSingle: () => {
                  if (col === 'reference') {
                    return Promise.resolve({
                      data: state.sellsyByReference.get(String(val)) ?? null,
                      error: null,
                    });
                  }
                  if (col === 'sellsy_item_id') {
                    return Promise.resolve({
                      data: state.sellsyById.get(Number(val)) ?? null,
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              }),
            }),
          };
        }
        if (table === 'tariff_editorial') {
          return {
            select: () => ({
              eq: (_col: string, val: number) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.editorialByProductId.get(Number(val)) ?? null,
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'addon_options') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: state.addonsById.get(String(val)) ?? null, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));
}

function resetState() {
  state.sellsyByReference.clear();
  state.sellsyById.clear();
  state.editorialByProductId.clear();
  state.addonsById.clear();
}

function addSellsy(ref: string, id: number, name: string, price: number) {
  const row: SellsyMirrorRow = {
    sellsy_item_id: id,
    reference: ref,
    name,
    price_excl_tax: price,
  };
  state.sellsyByReference.set(ref, row);
  state.sellsyById.set(id, row);
}

describe('hydrateQuoteItemsFromSelection (P6.x.5-octies)', () => {
  beforeEach(() => {
    // P6.x.5-octies : on reset les modules AVANT chaque test pour que
    // l'import dynamique du module sous test re-charge avec le mock courant.
    // Sinon le 1er test attrape le module réel (cache primé avant doMock).
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Pack + 2 addons résolvables → 3 quote_items', async () => {
    addSellsy('MDS-PACK-STD-ACCESS-PARIS', 100, 'Pack ACCESS Std Paris', 12500);
    addSellsy('MDS-ADDON-WIFI-EXPERT-PARIS', 200, 'WiFi Expert', 240);
    addSellsy('MDS-ADDON-LOGO-GOLD-PARIS', 300, 'Logo Gold', 3000);
    state.editorialByProductId.set(100, { category: 'pack', sub_category: 'standard' });
    state.editorialByProductId.set(200, { category: 'option', sub_category: 'wifi' });
    state.editorialByProductId.set(300, { category: 'sponsor', sub_category: 'or' });
    state.addonsById.set('uuid-wifi', { id: 'uuid-wifi', code: 'wifi', sellsy_item_id: 200 });
    state.addonsById.set('uuid-logo', { id: 'uuid-logo', code: 'logo', sellsy_item_id: 300 });
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'ACCESS',
      selected_addon_ids: ['uuid-wifi', 'uuid-logo'],
      events_interest: ['paris'],
      categorie: 'standard',
    });
    expect(r.warnings).toEqual([]);
    expect(r.quote_items).toHaveLength(3);
    expect(r.quote_items[0]).toMatchObject({
      reference: 'MDS-PACK-STD-ACCESS-PARIS',
      unit_price_ht: 12500,
      qty: 1,
      discount_pct: 0,
      category: 'pack',
      is_premium: false,
    });
    expect(r.quote_items[1].reference).toBe('MDS-ADDON-WIFI-EXPERT-PARIS');
    expect(r.quote_items[2].reference).toBe('MDS-ADDON-LOGO-GOLD-PARIS');
  });

  it('Pack non mappé Sellsy (référence introuvable) → 0 items + warning', async () => {
    // Aucun produit ajouté → resolvePackReference produit MDS-PACK-STD-ACCESS-PARIS
    // mais fetchSellsyProductByReference renverra null.
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'ACCESS',
      selected_addon_ids: [],
      events_interest: ['paris'],
      categorie: 'standard',
    });
    expect(r.quote_items).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/Pack référence MDS-PACK-STD-ACCESS-PARIS introuvable/);
  });

  it('Addon orphelin → skip avec warning, autres addons continuent', async () => {
    addSellsy('MDS-PACK-STD-ACCESS-PARIS', 100, 'Pack', 12500);
    addSellsy('MDS-ADDON-WIFI-EXPERT-PARIS', 200, 'WiFi', 240);
    state.editorialByProductId.set(100, { category: 'pack', sub_category: 'standard' });
    state.editorialByProductId.set(200, { category: 'option', sub_category: 'wifi' });
    state.addonsById.set('uuid-wifi', { id: 'uuid-wifi', code: 'wifi', sellsy_item_id: 200 });
    // 'uuid-orphan' n'existe pas
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'ACCESS',
      selected_addon_ids: ['uuid-orphan', 'uuid-wifi'],
      events_interest: ['paris'],
      categorie: 'standard',
    });
    expect(r.quote_items).toHaveLength(2); // Pack + WiFi
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/uuid-orphan/);
  });

  it('Sélection vide (pack=A_DEFINIR, addons=[]) → 0 items, 0 warnings', async () => {
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'A_DEFINIR',
      selected_addon_ids: [],
      events_interest: ['paris'],
      categorie: 'standard',
    });
    expect(r.quote_items).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("Pack PREMIUM → detectIsPremium true sur l'item", async () => {
    addSellsy('MDS-PACK-STD-PREMIUM-PARIS', 100, 'Pack PREMIUM', 20500);
    state.editorialByProductId.set(100, { category: 'pack', sub_category: 'premium' });
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'PREMIUM',
      selected_addon_ids: [],
      events_interest: ['paris'],
      categorie: 'standard',
    });
    expect(r.quote_items).toHaveLength(1);
    expect(r.quote_items[0].is_premium).toBe(true);
    expect(r.quote_items[0].sub_category).toBe('premium');
  });

  it('Addon sans sellsy_item_id → warning + skip', async () => {
    state.addonsById.set('uuid-unmapped', {
      id: 'uuid-unmapped',
      code: 'something',
      sellsy_item_id: null,
    });
    mockEnv();
    const { hydrateQuoteItemsFromSelection } = await import('./hydrate-quote-items');
    const r = await hydrateQuoteItemsFromSelection({
      pack_code: 'A_DEFINIR',
      selected_addon_ids: ['uuid-unmapped'],
      events_interest: [],
      categorie: 'standard',
    });
    expect(r.quote_items).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/uuid-unmapped/);
  });
});
