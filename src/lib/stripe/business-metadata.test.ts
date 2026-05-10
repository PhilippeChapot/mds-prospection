/**
 * P4.x.5 — verifie que tous les helpers de creation Stripe injectent
 * `metadata.business='mds-prospection'` (sur l'objet racine ET dans
 * payment_intent_data.metadata pour propager au PaymentIntent derive).
 *
 * Tests purs : on mocke getStripe() pour intercepter les arguments
 * passes aux create() sans avoir besoin d'un compte Stripe reel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRIPE_BUSINESS_TAG } from './constants';

describe('P4.x.5 — metadata.business sur tous les objets Stripe', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('STRIPE_BUSINESS_TAG vaut "mds-prospection"', () => {
    expect(STRIPE_BUSINESS_TAG).toBe('mds-prospection');
  });

  it('createConciergePaymentLink : metadata.business + payment_intent_data.metadata.business', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'plink_test', url: 'https://buy.stripe.com/test' });
    vi.doMock('./client', () => ({
      getStripe: () => ({ paymentLinks: { create } }),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'p1', is_test: false, sellsy_devis_id: '999', notes: null },
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      }),
    }));

    const { createConciergePaymentLink } = await import('./payment-link');
    await createConciergePaymentLink({
      prospectId: 'p1',
      amountEurHt: 1000,
      description: 'Test',
      expiresInDays: 7,
    });

    const args = create.mock.calls[0][0];
    expect(args.metadata).toMatchObject({
      flow: 'concierge',
      business: 'mds-prospection',
    });
    expect(args.payment_intent_data.metadata).toMatchObject({
      flow: 'concierge',
      business: 'mds-prospection',
    });
  });

  it('createAcomptePaymentLink : metadata.business + payment_intent_data.metadata.business', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'plink_acompte', url: 'https://buy.stripe.com/acompte' });
    vi.doMock('./client', () => ({
      getStripe: () => ({ paymentLinks: { create } }),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'p1', is_test: false, sellsy_devis_id: '999', notes: null },
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      }),
    }));

    const { createAcomptePaymentLink } = await import('./payment-link');
    const result = await createAcomptePaymentLink({
      prospectId: 'p1',
      amountEurTtc: 2746.8,
      devisNumber: 'D-20260509-02695',
    });
    expect('skipped' in result).toBe(false);

    const args = create.mock.calls[0][0];
    expect(args.metadata).toMatchObject({
      flow: 'acompte',
      expected_pct: '30',
      business: 'mds-prospection',
    });
    expect(args.payment_intent_data.metadata).toMatchObject({
      flow: 'acompte',
      expected_pct: '30',
      business: 'mds-prospection',
    });
  });

  it('createCheckoutSession (acompte_30pct) : metadata.business + flow=acompte', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' });
    vi.doMock('./client', () => ({
      getStripe: () => ({ checkout: { sessions: { create } } }),
    }));
    vi.doMock('@/lib/sync/skip-if-test', () => ({
      assertSyncAllowed: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'p1',
                    is_test: false,
                    estimated_amount: 1000,
                    payment_path: 'devis_acompte_stripe',
                    sellsy_devis_id: '999',
                    sellsy_devis_number: 'D-20260509-XX',
                    stripe_checkout_session_id: null,
                    contact: { email: 'test@example.com', first_name: 'Test', language: 'FR' },
                  },
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      }),
    }));

    const { createCheckoutSession } = await import('./checkout');
    await createCheckoutSession('p1', 'acompte_30pct');

    const args = create.mock.calls[0][0];
    expect(args.metadata).toMatchObject({
      type: 'acompte_30pct',
      flow: 'acompte',
      business: 'mds-prospection',
    });
    expect(args.payment_intent_data.metadata).toMatchObject({
      type: 'acompte_30pct',
      flow: 'acompte',
      business: 'mds-prospection',
    });
  });

  it('createCheckoutSession (integral) : flow=integral + business', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'cs_integral', url: 'https://checkout.stripe.com/int' });
    vi.doMock('./client', () => ({
      getStripe: () => ({ checkout: { sessions: { create } } }),
    }));
    vi.doMock('@/lib/sync/skip-if-test', () => ({
      assertSyncAllowed: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'p1',
                    is_test: false,
                    estimated_amount: 1000,
                    payment_path: 'facture_integrale',
                    sellsy_devis_id: '999',
                    sellsy_devis_number: 'D-...',
                    stripe_checkout_session_id: null,
                    contact: { email: 'test@example.com', first_name: 'T', language: 'EN' },
                  },
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      }),
    }));

    const { createCheckoutSession } = await import('./checkout');
    await createCheckoutSession('p1', 'integral');

    const args = create.mock.calls[0][0];
    expect(args.metadata.flow).toBe('integral');
    expect(args.metadata.business).toBe('mds-prospection');
    expect(args.payment_intent_data.metadata.business).toBe('mds-prospection');
  });
});
