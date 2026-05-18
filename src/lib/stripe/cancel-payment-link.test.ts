/**
 * @vitest-environment node
 *
 * P6.x.5-nonies — tests désactivation Stripe Payment Link (best-effort).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const stripeCalls: Array<{ method: string; args: unknown[] }> = [];
let nextStripeReject: Error | null = null;

function mockStripe() {
  vi.doMock('./client', () => ({
    getStripe: () => ({
      paymentLinks: {
        update: vi.fn(async (...args: unknown[]) => {
          stripeCalls.push({ method: 'paymentLinks.update', args });
          if (nextStripeReject) {
            const err = nextStripeReject;
            nextStripeReject = null;
            throw err;
          }
          return { id: args[0], active: false };
        }),
      },
    }),
  }));
}

describe('cancelStripePaymentLink (P6.x.5-nonies)', () => {
  beforeEach(() => {
    stripeCalls.length = 0;
    nextStripeReject = null;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path : appelle paymentLinks.update avec {active:false}', async () => {
    mockStripe();
    const { cancelStripePaymentLink } = await import('./cancel-payment-link');
    const r = await cancelStripePaymentLink('plink_test_123');
    expect(r.ok).toBe(true);
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0].args[0]).toBe('plink_test_123');
    expect(stripeCalls[0].args[1]).toEqual({ active: false });
  });

  it('Stripe lève (lien archivé) → ok:false, jamais throw, message conservé', async () => {
    mockStripe();
    nextStripeReject = new Error('No such payment_link: plink_x');
    const { cancelStripePaymentLink } = await import('./cancel-payment-link');
    const r = await cancelStripePaymentLink('plink_x');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No such payment_link/);
  });
});
