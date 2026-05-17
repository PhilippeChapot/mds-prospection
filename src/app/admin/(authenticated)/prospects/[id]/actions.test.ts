/**
 * @vitest-environment node
 *
 * P6.x.5-bis — tests routing emitSellsyDocumentAction.
 *
 * Doctrine : si prospects.quote_items non-vide → délègue à
 * emitSellsyDevisFromQuoteBuilderAction (nouveau flow). Sinon → fallback
 * runPostConversion (legacy signup→devis qui lit pack_code +
 * selected_addon_ids + step2_payload).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_PROSPECT_ID = '92d51b10-7085-4695-b257-72c61d01917a';

const newPathMock = vi.fn();
const legacyPathMock = vi.fn();

interface MockState {
  quoteItems: unknown;
  /** P6.x.5-septies : pack_code lu côté server action pour le garde-fou
   *  legacy (A_DEFINIR + null sont rejetés). */
  packCode: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR' | null;
}
const state: MockState = { quoteItems: [], packCode: 'ACCESS' };

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'u', role: 'admin', email: 'x@y' }),
  }));

  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () =>
      Promise.resolve({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { quote_items: state.quoteItems, pack_code: state.packCode },
                  error: null,
                }),
            }),
          }),
        }),
      }),
  }));

  vi.doMock('@/lib/admin/prospects/quote-builder-actions', () => ({
    emitSellsyDevisFromQuoteBuilderAction: newPathMock,
  }));

  vi.doMock('@/lib/sellsy/post-conversion', () => ({
    runPostConversion: legacyPathMock,
  }));

  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
}

describe('emitSellsyDocumentAction routing (P6.x.5-bis / P6.x.5-septies)', () => {
  beforeEach(() => {
    state.quoteItems = [];
    state.packCode = 'ACCESS'; // default pour les tests legacy nominal
    newPathMock.mockReset();
    legacyPathMock.mockReset();
    newPathMock.mockResolvedValue({ ok: true });
    legacyPathMock.mockResolvedValue({ ok: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('quote_items non-vide → délègue à emitSellsyDevisFromQuoteBuilderAction (nouveau flow)', async () => {
    state.quoteItems = [
      {
        sellsy_product_id: 1,
        reference: 'MDS-PACK-STD',
        name: 'Pack',
        unit_price_ht: 100,
        qty: 1,
        category: 'pack',
        sub_category: 'standard',
        is_premium: false,
      },
    ];
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    const r = await emitSellsyDocumentAction(VALID_PROSPECT_ID);
    expect(r.ok).toBe(true);
    expect(newPathMock).toHaveBeenCalledTimes(1);
    expect(newPathMock.mock.calls[0][0]).toEqual({ prospect_id: VALID_PROSPECT_ID });
    expect(legacyPathMock).not.toHaveBeenCalled();
  });

  it('quote_items vide → fallback runPostConversion (legacy flow)', async () => {
    state.quoteItems = [];
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    const r = await emitSellsyDocumentAction(VALID_PROSPECT_ID);
    expect(r.ok).toBe(true);
    expect(legacyPathMock).toHaveBeenCalledTimes(1);
    expect(legacyPathMock.mock.calls[0][0]).toBe(VALID_PROSPECT_ID);
    expect(newPathMock).not.toHaveBeenCalled();
  });

  it('lock_conflict du legacy path est propagé sans throw', async () => {
    state.quoteItems = [];
    legacyPathMock.mockResolvedValue({ ok: false, skipped: 'lock_conflict' });
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    const r = await emitSellsyDocumentAction(VALID_PROSPECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('lock_conflict');
  });

  it('erreur du nouveau path → throw avec message', async () => {
    state.quoteItems = [
      {
        sellsy_product_id: 1,
        reference: 'MDS-PACK-STD',
        name: 'Pack',
        unit_price_ht: 100,
        qty: 1,
        category: 'pack',
        sub_category: 'standard',
        is_premium: false,
      },
    ];
    newPathMock.mockResolvedValue({ ok: false, error: 'Sync échouée' });
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    await expect(emitSellsyDocumentAction(VALID_PROSPECT_ID)).rejects.toThrow(/Sync échouée/);
  });

  it("P6.x.5-septies — quote_items vide ET pack_code='A_DEFINIR' → throw 'Aucun produit à émettre' (pas de fallback legacy)", async () => {
    state.quoteItems = [];
    state.packCode = 'A_DEFINIR';
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    await expect(emitSellsyDocumentAction(VALID_PROSPECT_ID)).rejects.toThrow(
      /Aucun produit à émettre/i,
    );
    expect(legacyPathMock).not.toHaveBeenCalled();
    expect(newPathMock).not.toHaveBeenCalled();
  });

  it('P6.x.5-septies — quote_items vide ET pack_code=null → throw même message (cas prospects landing non configurés)', async () => {
    state.quoteItems = [];
    state.packCode = null;
    mockEnv();
    const { emitSellsyDocumentAction } = await import('./actions');
    await expect(emitSellsyDocumentAction(VALID_PROSPECT_ID)).rejects.toThrow(
      /Aucun produit à émettre/i,
    );
    expect(legacyPathMock).not.toHaveBeenCalled();
  });
});
