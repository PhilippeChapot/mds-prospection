/**
 * P6.x.1b-α — tests createSupplementaryCheckoutSession.
 *
 * Mocke :
 *   - cookies() (next/headers) → cookie présent ou absent
 *   - verifySessionToken (JWT decode)
 *   - getProspectForPartenaire (helper queries)
 *   - getSupabaseServiceClient (sellsy_products_mirror + supplementary_orders)
 *   - getStripe (sessions.create)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (cookieValue[name] ? { value: cookieValue[name] } : undefined),
    }),
}));

const cookieValue: Record<string, string | undefined> = {};

const ENV_BACKUP = { ...process.env };

interface State {
  prospect?: {
    id: string;
    status: string;
    signed_at: string | null;
    contact_email: string | null;
    company_name: string | null;
    company_sellsy_id: string | null;
  } | null;
  products?: Array<{
    sellsy_item_id: number;
    reference: string;
    name: string;
    price_excl_tax: number | null;
    is_archived: boolean;
  }>;
  insertedOrders: Array<Record<string, unknown>>;
  updatedOrders: Array<{ id: string; patch: Record<string, unknown> }>;
  stripeShouldFail?: boolean;
  stripeReturnUrl?: string;
}

function mockAll(state: State) {
  vi.doMock('@/lib/espace-partenaire/jwt', () => ({
    ESPACE_EXPOSANT_SESSION_COOKIE: 'espace_partenaire_session',
    verifySessionToken: vi.fn().mockResolvedValue({ prospectId: 'prospect-1' }),
  }));

  vi.doMock('./queries', async () => {
    const actual = await vi.importActual<typeof import('./queries')>('./queries');
    return {
      ...actual,
      getProspectForPartenaire: vi.fn().mockResolvedValue(state.prospect ?? null),
    };
  });

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'sellsy_products_mirror') {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: state.products ?? [], error: null }),
            }),
          };
        }
        if (table === 'supplementary_orders') {
          return {
            insert: (payload: Record<string, unknown>) => {
              state.insertedOrders.push(payload);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'order-new' }, error: null }),
                }),
              };
            },
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                state.updatedOrders.push({ id, patch });
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        return {};
      },
    }),
  }));

  vi.doMock('@/lib/stripe/client', () => ({
    getStripe: () => ({
      checkout: {
        sessions: {
          create: vi.fn().mockImplementation(() => {
            if (state.stripeShouldFail) throw new Error('Stripe boom');
            return Promise.resolve({
              id: 'cs_test_abc',
              url: state.stripeReturnUrl ?? 'https://checkout.stripe.com/c/abc',
            });
          }),
        },
      },
    }),
  }));
}

function makeState(over: Partial<State> = {}): State {
  return { insertedOrders: [], updatedOrders: [], ...over };
}

describe('createSupplementaryCheckoutSession (P6.x.1b)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
    cookieValue.espace_partenaire_session = 'valid-jwt-token';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.NEXT_PUBLIC_APP_URL) delete process.env.NEXT_PUBLIC_APP_URL;
    cookieValue.espace_partenaire_session = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuses when session cookie absent', async () => {
    cookieValue.espace_partenaire_session = undefined;
    mockAll(makeState());
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [{ sellsy_product_id: 1, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Session/);
  });

  it('refuses when prospect not eligible (not signed)', async () => {
    const state = makeState({
      prospect: {
        id: 'prospect-1',
        status: 'devis_envoye',
        signed_at: null,
        contact_email: 'p@x.com',
        company_name: 'X',
        company_sellsy_id: '42',
      },
    });
    mockAll(state);
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [{ sellsy_product_id: 1, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signé/i);
    expect(state.insertedOrders).toHaveLength(0);
  });

  it('refuses when a requested product is archived', async () => {
    const state = makeState({
      prospect: {
        id: 'prospect-1',
        status: 'signe',
        signed_at: '2026-04-01T12:00:00Z',
        contact_email: 'p@x.com',
        company_name: 'X',
        company_sellsy_id: '42',
      },
      products: [
        {
          sellsy_item_id: 1,
          reference: 'MDS-WIFI',
          name: 'WiFi',
          price_excl_tax: 100,
          is_archived: true,
        },
      ],
    });
    mockAll(state);
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [{ sellsy_product_id: 1, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/archivé/i);
    expect(state.insertedOrders).toHaveLength(0);
  });

  it('refuses when contact_email is missing', async () => {
    const state = makeState({
      prospect: {
        id: 'prospect-1',
        status: 'signe',
        signed_at: '2026-04-01T12:00:00Z',
        contact_email: null,
        company_name: 'X',
        company_sellsy_id: '42',
      },
      products: [
        {
          sellsy_item_id: 1,
          reference: 'MDS-X',
          name: 'X',
          price_excl_tax: 100,
          is_archived: false,
        },
      ],
    });
    mockAll(state);
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [{ sellsy_product_id: 1, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Email/i);
  });

  it('happy path : creates pending order + returns Stripe url', async () => {
    const state = makeState({
      prospect: {
        id: 'prospect-1',
        status: 'signe',
        signed_at: '2026-04-01T12:00:00Z',
        contact_email: 'lead@acme.com',
        company_name: 'Acme',
        company_sellsy_id: '42',
      },
      products: [
        {
          sellsy_item_id: 1,
          reference: 'MDS-ADDON-WIFI-EXPERT-PARIS',
          name: 'WiFi Expert',
          price_excl_tax: 100,
          is_archived: false,
        },
        {
          sellsy_item_id: 2,
          reference: 'MDS-ADDON-LOGO-GOLD-PARIS',
          name: 'Sponsor Or',
          price_excl_tax: 5000,
          is_archived: false,
        },
      ],
    });
    mockAll(state);
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [
        { sellsy_product_id: 1, qty: 2 }, // 100 × 2 = 200 HT
        { sellsy_product_id: 2, qty: 1 }, // 5000 HT
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain('checkout.stripe.com');

    // Order INSERT pending
    expect(state.insertedOrders).toHaveLength(1);
    const ord = state.insertedOrders[0];
    expect(ord.status).toBe('pending');
    expect(ord.prospect_id).toBe('prospect-1');
    expect(ord.total_ht_eur).toBe(5200);
    expect(ord.total_ttc_eur).toBe(6240); // 5200 × 1.20
    expect(ord.vat_rate).toBe(20);
    const items = ord.items as Array<{
      sellsy_product_id: number;
      qty: number;
      unit_price_ht: number;
      line_total_ht: number;
    }>;
    expect(items).toHaveLength(2);
    expect(items[0].line_total_ht).toBe(200);

    // UPDATE session id
    const updateSession = state.updatedOrders.find(
      (u) =>
        (u.patch as { stripe_checkout_session_id?: string }).stripe_checkout_session_id ===
        'cs_test_abc',
    );
    expect(updateSession).toBeDefined();
  });

  it('marks order as failed when Stripe throws', async () => {
    const state = makeState({
      prospect: {
        id: 'prospect-1',
        status: 'signe',
        signed_at: '2026-04-01T12:00:00Z',
        contact_email: 'lead@acme.com',
        company_name: 'Acme',
        company_sellsy_id: '42',
      },
      products: [
        {
          sellsy_item_id: 1,
          reference: 'MDS-X',
          name: 'X',
          price_excl_tax: 100,
          is_archived: false,
        },
      ],
      stripeShouldFail: true,
    });
    mockAll(state);
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({
      items: [{ sellsy_product_id: 1, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(state.insertedOrders).toHaveLength(1); // row créée
    // L'order est passé en status=failed
    const failed = state.updatedOrders.find(
      (u) => (u.patch as { status?: string }).status === 'failed',
    );
    expect(failed).toBeDefined();
  });

  it('refuses validation errors (empty items)', async () => {
    mockAll(makeState());
    const { createSupplementaryCheckoutSession } = await import('./actions');
    const result = await createSupplementaryCheckoutSession({ items: [] });
    expect(result.ok).toBe(false);
  });
});
