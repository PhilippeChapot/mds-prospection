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
  sellsy_devis_number?: string | null;
  acompte_payment_link_id?: string | null;
  is_test?: boolean;
  company: { id: string; sellsy_id: number | null; name?: string };
  contact: {
    sellsy_contact_id: number | null;
    email?: string | null;
    first_name?: string | null;
    language?: 'FR' | 'EN' | null;
  } | null;
  status: 'lead' | 'devis_envoye' | string;
}

interface ReemissionCalls {
  cancelDevis: Array<{ sellsy_devis_id: number; reason?: string }>;
  addComment: Array<{ sellsy_devis_id: number; comment: string }>;
  cancelStripeLink: string[];
  emailsSent: Array<{ to: string; subject: string; locale: 'fr' | 'en' }>;
  auditInserts: Array<Record<string, unknown>>;
}

interface MockState {
  profileRole: 'admin' | 'sales' | 'viewer';
  prospect: ProspectStub | null;
  companySellsyIdPostSync: number | null;
  prospectUpdates: Array<Record<string, unknown>>;
  prospectStatusUpdate: Record<string, unknown> | null;
  sellsyResponses: Map<string, unknown>;
  sellsyCalls: Array<{ endpoint: string; method: string; body?: string }>;
  reemit: ReemissionCalls;
  cancelDevisOk: boolean;
  stripeUpdateThrow: boolean;
}

const state: MockState = {
  profileRole: 'admin',
  prospect: null,
  companySellsyIdPostSync: null,
  prospectUpdates: [],
  prospectStatusUpdate: null,
  sellsyResponses: new Map(),
  sellsyCalls: [],
  reemit: {
    cancelDevis: [],
    addComment: [],
    cancelStripeLink: [],
    emailsSent: [],
    auditInserts: [],
  },
  cancelDevisOk: true,
  stripeUpdateThrow: false,
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
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.reemit.auditInserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));

  // P6.x.5-nonies — helpers utilisés par runReemissionCleanup (imports
  // dynamiques dans le code prod, donc mockés ici pour les capturer).
  vi.doMock('@/lib/sellsy/cancel-devis', () => ({
    cancelSellsyDevis: vi.fn(async (input: { sellsy_devis_id: number; reason?: string }) => {
      state.reemit.cancelDevis.push(input);
      return state.cancelDevisOk
        ? { ok: true, cancelled: true }
        : { ok: false, cancelled: false, message: 'Sellsy refused' };
    }),
    addCommentToSellsyDevis: vi.fn(async (input: { sellsy_devis_id: number; comment: string }) => {
      state.reemit.addComment.push(input);
      return { ok: true };
    }),
  }));
  vi.doMock('@/lib/stripe/cancel-payment-link', () => ({
    cancelStripePaymentLink: vi.fn(async (linkId: string) => {
      state.reemit.cancelStripeLink.push(linkId);
      if (state.stripeUpdateThrow) {
        return { ok: false, message: 'No such payment_link' };
      }
      return { ok: true };
    }),
  }));
  vi.doMock('@/lib/resend/templates/prospect-devis-updated', () => ({
    renderProspectDevisUpdated: vi.fn(
      (locale: 'fr' | 'en', params: { newDevisNumber: string }) => ({
        subject:
          locale === 'en'
            ? `[MDS 2026] Your quote has been updated — ${params.newDevisNumber}`
            : `[MDS 2026] Votre devis a été mis à jour — ${params.newDevisNumber}`,
        html: '<html></html>',
        text: 'text',
      }),
    ),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(
      async (input: { to: string; subject: string; html: string }) => {
        const locale: 'fr' | 'en' = input.subject.startsWith('[MDS 2026] Your') ? 'en' : 'fr';
        state.reemit.emailsSent.push({ to: input.to, subject: input.subject, locale });
        return { id: 'resend_test_id' };
      },
    ),
  }));

  vi.doMock('@/lib/sellsy/sync-prospect', () => ({
    syncProspectToSellsy: vi.fn().mockResolvedValue(undefined),
  }));

  // SellsyError minimal local (équivalent à src/lib/sellsy/client.ts) — on
  // évite l'import du vrai module qui chargerait ses dépendances réseau.
  class SellsyErrorMock extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'SellsyError';
      this.status = status;
      this.body = body;
    }
  }
  vi.doMock('@/lib/sellsy/client', () => ({
    SellsyError: SellsyErrorMock,
    sellsyFetch: vi.fn(async (endpoint: string, opts?: { method?: string; body?: string }) => {
      state.sellsyCalls.push({
        endpoint,
        method: opts?.method ?? 'GET',
        body: opts?.body,
      });
      const key = `${opts?.method ?? 'GET'} ${endpoint}`;
      const resp = state.sellsyResponses.get(key);
      // Convention test : si la response est de la forme { __throw: { status, body } },
      // on throw une SellsyError au lieu de renvoyer la valeur.
      if (resp && typeof resp === 'object' && '__throw' in (resp as Record<string, unknown>)) {
        const t = (resp as { __throw: { status: number; body: unknown } }).__throw;
        throw new SellsyErrorMock(
          `Sellsy fetch ${endpoint} failed (${t.status})`,
          t.status,
          t.body,
        );
      }
      return resp ?? {};
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
    state.reemit = {
      cancelDevis: [],
      addComment: [],
      cancelStripeLink: [],
      emailsSent: [],
      auditInserts: [],
    };
    state.cancelDevisOk = true;
    state.stripeUpdateThrow = false;
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
    state.reemit = {
      cancelDevis: [],
      addComment: [],
      cancelStripeLink: [],
      emailsSent: [],
      auditInserts: [],
    };
    state.cancelDevisOk = true;
    state.stripeUpdateThrow = false;
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

  it('P6.x.5-sexies — POST /estimates avec row.discount Sellsy V2 natif (unit_amount = prix catalogue)', async () => {
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
        discount?: { type: 'percent' | 'amount'; value: string };
      }>;
      note?: string;
    };
    // unit_amount = prix catalogue (Sellsy applique la remise et affiche %)
    expect(body.rows[0].unit_amount).toBe('12500.00');
    expect(body.rows[1].unit_amount).toBe('3000.00');
    // row.discount : type='percent', value=STRING (format OpenAPI officiel)
    expect(body.rows[0].discount).toEqual({ type: 'percent', value: '30' });
    expect(body.rows[1].discount).toEqual({ type: 'percent', value: '10' });
    // Note Sellsy : justification libre uniquement (la remise s'affiche
    // dans la colonne native Sellsy, plus de redondance dans la note)
    expect(body.note).toBe('Tarif Institutionnel UDECAM');
  });

  it('PREMIUM dans items → pas de champ discount (clamp forcé 0%), unit_amount = prix plein', async () => {
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
      rows: Array<{ unit_amount: string; discount?: { type: string; value: string } }>;
      note?: string;
    };
    // PREMIUM = prix catalogue, AUCUN champ discount (clamp forcé 0)
    expect(body.rows[0].unit_amount).toBe('25000.00');
    expect(body.rows[0].discount).toBeUndefined();
    // SPONSOR = prix catalogue + discount 20% structuré
    expect(body.rows[1].unit_amount).toBe('3000.00');
    expect(body.rows[1].discount).toEqual({ type: 'percent', value: '20' });
    // Pas de promo_reason → pas de note
    expect(body.note).toBeUndefined();
  });

  it('Aucune remise sur tous les items → aucun row sans champ discount + note vide si pas de justification', async () => {
    state.prospect!.quote_items = [
      { ...PACK_STD, discount_pct: 0 },
      { ...SPONSOR, discount_pct: 0 },
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
      note?: string;
    };
    // unit_amount = prix catalogue, aucun champ discount sur aucune ligne
    expect(body.rows[0].unit_amount).toBe('12500.00');
    expect(body.rows[0].discount).toBeUndefined();
    expect(body.rows[1].unit_amount).toBe('3000.00');
    expect(body.rows[1].discount).toBeUndefined();
    expect(body.note).toBeUndefined();
  });

  it('P6.x.6 — succès devis reset last_sync_error_* + stamp last_synced_sellsy_at', async () => {
    // Régression : avant P6.x.6, l'UPDATE prospects qui posait sellsy_devis_id
    // n'effaçait PAS last_sync_error_message / _at / _provider. Du coup, après
    // un échec /individuals suivi d'une émission devis OK, la carte admin
    // "Synchronisations externes" continuait à afficher l'erreur Sellsy stale.
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);
    // Le UPDATE qui pose sellsy_devis_id doit aussi reset error + stamper success.
    const devisUpdate = state.prospectUpdates.find((u) => u.sellsy_devis_id !== undefined);
    expect(devisUpdate).toBeDefined();
    expect(devisUpdate?.last_sync_error_at).toBeNull();
    expect(devisUpdate?.last_sync_error_message).toBeNull();
    expect(devisUpdate?.last_sync_error_provider).toBeNull();
    expect(devisUpdate?.last_synced_sellsy_at).toEqual(expect.any(String));
  });

  it('P6.x.5-quinquies — SellsyError 400 → action retourne le body Sellsy dans error (debug admin)', async () => {
    // Pré-charge la réponse "throw SellsyError" pour le POST /estimates
    state.sellsyResponses.set('POST /estimates', {
      __throw: {
        status: 400,
        body: { error: { code: 'invalid_field', message: 'unknown field row.discount' } },
      },
    });
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/400/);
      // Le body Sellsy est sérialisé et inclus dans l'erreur — gain de
      // debugabilité côté admin (toast affiche le message Sellsy précis).
      expect(r.error).toMatch(/unknown field/);
    }
  });
});

// ---------------------------------------------------------------------------
// P6.x.5-nonies — ré-émission devis (cancel old + email + audit)
// ---------------------------------------------------------------------------

describe('emitSellsyDevisFromQuoteBuilderAction — ré-émission (P6.x.5-nonies)', () => {
  beforeEach(() => {
    state.profileRole = 'admin';
    state.prospect = {
      id: '92d51b10-7085-4695-b257-72c61d01917a',
      quote_items: [{ ...PACK_STD, discount_pct: 30 }],
      promo_reason: 'Tarif revu',
      // Ancien devis présent → la ré-émission doit le ré-annuler
      sellsy_devis_id: '4242',
      sellsy_devis_number: 'D-20260518-02702',
      acompte_payment_link_id: 'plink_old_123',
      is_test: false,
      company: { id: 'co-1', sellsy_id: 9999, name: 'Acme Media' },
      contact: {
        sellsy_contact_id: 7,
        email: 'jean@acme.example',
        first_name: 'jean-marc',
        language: 'FR',
      },
      status: 'devis_envoye',
    };
    state.companySellsyIdPostSync = 9999;
    state.prospectUpdates = [];
    state.prospectStatusUpdate = null;
    state.sellsyResponses = new Map([
      ['POST /estimates', { data: { id: 999 } }],
      [
        'GET /estimates/999',
        {
          data: {
            number: 'D-20260519-00010',
            amounts: { total: '10500.00', total_excl_tax: '8750.00' },
            public_link_enabled: true,
            public_link: 'https://sellsy.example/d/999',
          },
        },
      ],
    ]);
    state.sellsyCalls = [];
    state.reemit = {
      cancelDevis: [],
      addComment: [],
      cancelStripeLink: [],
      emailsSent: [],
      auditInserts: [],
    };
    state.cancelDevisOk = true;
    state.stripeUpdateThrow = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('Ré-émission : ancien devis annulé + stripe link désactivé + commentaire + email FR + audit log', async () => {
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);

    // 1. Sellsy cancel appelé avec l'ID de l'ancien devis (4242)
    expect(state.reemit.cancelDevis).toHaveLength(1);
    expect(state.reemit.cancelDevis[0].sellsy_devis_id).toBe(4242);
    expect(state.reemit.cancelDevis[0].reason).toMatch(/D-20260519-00010/);

    // 2. Stripe payment link désactivé (best-effort, !is_test)
    expect(state.reemit.cancelStripeLink).toEqual(['plink_old_123']);

    // 3. Commentaire ajouté sur l'ancien devis
    expect(state.reemit.addComment).toHaveLength(1);
    expect(state.reemit.addComment[0].sellsy_devis_id).toBe(4242);

    // 4. Email envoyé en FR (contact.language='FR')
    expect(state.reemit.emailsSent).toHaveLength(1);
    expect(state.reemit.emailsSent[0].to).toBe('jean@acme.example');
    expect(state.reemit.emailsSent[0].locale).toBe('fr');
    expect(state.reemit.emailsSent[0].subject).toMatch(/Votre devis/);

    // 5. Audit log inséré (action='update', metadata kind='devis_reemit')
    expect(state.reemit.auditInserts).toHaveLength(1);
    const audit = state.reemit.auditInserts[0];
    expect(audit.action).toBe('update');
    expect(audit.entity_type).toBe('prospects');
    expect((audit.before as { kind: string }).kind).toBe('devis_reemit');
    expect((audit.before as { sellsy_devis_id: string }).sellsy_devis_id).toBe('4242');
    expect((audit.after as { sellsy_devis_id: string }).sellsy_devis_id).toBe('999');
  });

  it('Première émission (pas d’ancien devis) → aucune annulation, aucun email "mis à jour"', async () => {
    state.prospect!.sellsy_devis_id = null;
    state.prospect!.sellsy_devis_number = null;
    state.prospect!.acompte_payment_link_id = null;
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);
    expect(state.reemit.cancelDevis).toHaveLength(0);
    expect(state.reemit.cancelStripeLink).toHaveLength(0);
    expect(state.reemit.emailsSent).toHaveLength(0);
    expect(state.reemit.auditInserts).toHaveLength(0);
  });

  it('Échec annulation Sellsy → nouveau devis reste valide (cleanup best-effort)', async () => {
    state.cancelDevisOk = false; // Sellsy refuse l'annulation
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    // Le nouveau devis a quand même été émis avec succès
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sellsy_devis_id).toBe('999');
    // L'annulation a été tentée, mais le commentaire NE doit PAS être posté
    // (puisque l'ancien n'a pas été cancelled)
    expect(state.reemit.cancelDevis).toHaveLength(1);
    expect(state.reemit.addComment).toHaveLength(0);
    // L'audit log reste tracé avec cancelled_old=false
    expect(state.reemit.auditInserts).toHaveLength(1);
    const audit = state.reemit.auditInserts[0];
    expect((audit.after as { cancelled_old: boolean }).cancelled_old).toBe(false);
  });

  it('contact.language=EN → email envoyé avec sujet anglais', async () => {
    state.prospect!.contact = {
      sellsy_contact_id: 7,
      email: 'sarah@acme.example',
      first_name: 'sarah',
      language: 'EN',
    };
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(state.reemit.emailsSent).toHaveLength(1);
    expect(state.reemit.emailsSent[0].locale).toBe('en');
    expect(state.reemit.emailsSent[0].subject).toMatch(/Your quote/);
  });

  it('is_test=true → pas d’email envoyé ni de désactivation Stripe (mais Sellsy cancel + audit OK)', async () => {
    state.prospect!.is_test = true;
    mockEnv();
    const { emitSellsyDevisFromQuoteBuilderAction } = await import('./quote-builder-actions');
    const r = await emitSellsyDevisFromQuoteBuilderAction({
      prospect_id: '92d51b10-7085-4695-b257-72c61d01917a',
    });
    expect(r.ok).toBe(true);
    expect(state.reemit.emailsSent).toHaveLength(0);
    expect(state.reemit.cancelStripeLink).toHaveLength(0);
    // L'annulation Sellsy est tentée même en test (utile pour QA sandbox)
    expect(state.reemit.cancelDevis).toHaveLength(1);
    expect(state.reemit.auditInserts).toHaveLength(1);
  });
});
