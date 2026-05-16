/**
 * P6.x.1b-β — tests handleSupplementaryCheckoutCompleted.
 *
 * Validation :
 *   - session.payment_status != 'paid' → no-op
 *   - missing supplementary_order_id metadata → no-op
 *   - idempotence : si order déjà en 'paid', skip facture + emails + Brevo
 *   - happy path : UPDATE paid + create facture + emails + Brevo
 *   - facture Sellsy fail → continue (order reste paid)
 *   - sellsy_id manquant → skip facture sans bloquer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';

const ENV_BACKUP = { ...process.env };

interface State {
  /** Result du UPDATE supplementary_orders pending→paid (rows updated). */
  paidUpdateRows: Array<{ id: string }>;
  order: {
    id: string;
    prospect_id: string;
    items: unknown;
    total_ht_eur: number;
    total_ttc_eur: number;
    vat_rate: number;
    status: string;
  } | null;
  prospect: {
    id: string;
    contact: { email: string; first_name: string | null } | null;
    company: { name: string; sellsy_id: string | null } | null;
  } | null;
  factureResult?: {
    ok: boolean;
    facture_id?: number;
    facture_number?: string;
    facture_public_url?: string;
    error?: string;
  };
  resendCalls: Array<{ to: string; subject: string }>;
  adminNotifCalls: Array<string>;
  brevoCalls: number;
  factureUpdate?: Record<string, unknown>;
}

function mockAll(state: State) {
  // Supabase
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'supplementary_orders') {
          return {
            update: (patch: Record<string, unknown>) => ({
              eq: (col1: string, _val1: unknown) => ({
                eq: (col2: string, val2: unknown) => ({
                  select: () => {
                    // pending → paid update
                    if (col2 === 'status' && val2 === 'pending') {
                      return Promise.resolve({
                        data: state.paidUpdateRows,
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                }),
                then: (resolve: (r: unknown) => void) => {
                  // single .eq() update — facture upsert
                  void col1;
                  state.factureUpdate = patch;
                  resolve({ error: null });
                },
              }),
            }),
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.order, error: null }),
              }),
            }),
          };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.prospect, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));

  // Sellsy facture
  vi.doMock('@/lib/sellsy/create-supplementary-facture', () => ({
    createSupplementaryFacture: vi.fn().mockResolvedValue(
      state.factureResult ?? {
        ok: true,
        facture_id: 999,
        facture_number: 'F-2026-001',
        facture_public_url: 'https://sellsy.com/inv/999',
      },
    ),
  }));

  // Resend client + admin notifier
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi
      .fn()
      .mockImplementation(async (p: { to: string; subject: string }) => {
        state.resendCalls.push({ to: p.to, subject: p.subject });
      }),
  }));
  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: vi.fn().mockImplementation(async (category: string) => {
      state.adminNotifCalls.push(category);
    }),
  }));

  // Brevo fetch
  global.fetch = vi.fn().mockImplementation((url: string | URL) => {
    if (String(url).includes('/contacts/lists/')) {
      state.brevoCalls += 1;
    }
    return Promise.resolve({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as Response);
  });
}

function makeState(over: Partial<State> = {}): State {
  return {
    paidUpdateRows: [],
    order: null,
    prospect: null,
    resendCalls: [],
    adminNotifCalls: [],
    brevoCalls: 0,
    ...over,
  };
}

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_abc',
    payment_status: 'paid',
    payment_intent: 'pi_abc',
    metadata: {
      flow: 'supplementary',
      supplementary_order_id: 'order-1',
      prospect_id: 'prospect-1',
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

const REAL_ORDER = {
  id: 'order-1',
  prospect_id: 'prospect-1',
  items: [
    {
      sellsy_product_id: 100,
      reference: 'MDS-ADDON-WIFI',
      name: 'WiFi',
      unit_price_ht: 50,
      qty: 2,
      line_total_ht: 100,
    },
  ],
  total_ht_eur: 100,
  total_ttc_eur: 120,
  vat_rate: 20,
  status: 'paid',
};

const REAL_PROSPECT = {
  id: 'prospect-1',
  contact: { email: 'lead@acme.com', first_name: 'Alice' },
  company: { name: 'Acme', sellsy_id: '1234' },
};

describe('handleSupplementaryCheckoutCompleted (P6.x.1b-β)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_LIST_ID_EXPOSANT_COMMANDE_SUPPLEMENTAIRE = '300';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.BREVO_API_KEY) delete process.env.BREVO_API_KEY;
    if (!ENV_BACKUP.BREVO_LIST_ID_EXPOSANT_COMMANDE_SUPPLEMENTAIRE)
      delete process.env.BREVO_LIST_ID_EXPOSANT_COMMANDE_SUPPLEMENTAIRE;
    if (!ENV_BACKUP.NEXT_PUBLIC_APP_URL) delete process.env.NEXT_PUBLIC_APP_URL;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('no-op when payment_status != paid', async () => {
    const state = makeState();
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(makeSession({ payment_status: 'unpaid' }));
    expect(state.resendCalls).toHaveLength(0);
    expect(state.adminNotifCalls).toHaveLength(0);
  });

  it('no-op when metadata.supplementary_order_id missing', async () => {
    const state = makeState();
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(
      makeSession({ metadata: { flow: 'supplementary' } as Stripe.Metadata }),
    );
    expect(state.resendCalls).toHaveLength(0);
  });

  it('idempotent : skips if order already paid (0 rows updated)', async () => {
    const state = makeState({ paidUpdateRows: [] }); // UPDATE returns 0 rows
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(makeSession());
    expect(state.resendCalls).toHaveLength(0);
    expect(state.adminNotifCalls).toHaveLength(0);
    expect(state.brevoCalls).toBe(0);
  });

  it('happy path : creates facture + sends 2 emails + adds Brevo', async () => {
    const state = makeState({
      paidUpdateRows: [{ id: 'order-1' }],
      order: REAL_ORDER,
      prospect: REAL_PROSPECT,
    });
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(makeSession());

    // facture créée + stockée
    expect(state.factureUpdate?.sellsy_facture_id).toBe(999);
    expect(state.factureUpdate?.sellsy_facture_number).toBe('F-2026-001');

    // email client envoyé à lead@acme.com
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0].to).toBe('lead@acme.com');
    expect(state.resendCalls[0].subject).toMatch(/MDS 2026/);

    // notif admin
    expect(state.adminNotifCalls).toContain('admin_supplementary_received');

    // Brevo : 1 add
    expect(state.brevoCalls).toBe(1);
  });

  it('continues when Sellsy facture fails (order reste paid)', async () => {
    const state = makeState({
      paidUpdateRows: [{ id: 'order-1' }],
      order: REAL_ORDER,
      prospect: REAL_PROSPECT,
      factureResult: { ok: false, error: 'Sellsy boom' },
    });
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(makeSession());

    // Email client tout de même envoyé (facture absente OK)
    expect(state.resendCalls).toHaveLength(1);
    expect(state.adminNotifCalls).toContain('admin_supplementary_received');
    // factureUpdate NON appelé puisque sellsyResult.ok=false
    expect(state.factureUpdate).toBeUndefined();
  });

  it('skips facture if company has no sellsy_id but still sends emails', async () => {
    const state = makeState({
      paidUpdateRows: [{ id: 'order-1' }],
      order: REAL_ORDER,
      prospect: { ...REAL_PROSPECT, company: { name: 'Acme', sellsy_id: null } },
    });
    mockAll(state);
    const { handleSupplementaryCheckoutCompleted } = await import('./webhook-handler');
    await handleSupplementaryCheckoutCompleted(makeSession());
    expect(state.resendCalls).toHaveLength(1);
    expect(state.adminNotifCalls).toContain('admin_supplementary_received');
    expect(state.factureUpdate).toBeUndefined();
  });
});
