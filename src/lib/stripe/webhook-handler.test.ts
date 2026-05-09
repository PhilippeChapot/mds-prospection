import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import { handleStripeEvent } from './webhook-handler';

describe('handleStripeEvent', () => {
  beforeEach(() => {
    // Le default branch logge un message et return — pas d'effet de bord.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('ignore les types non geres sans erreur', async () => {
    const event = {
      id: 'evt_unhandled_test',
      type: 'invoice.created',
      data: { object: {} },
    } as unknown as Stripe.Event;
    await expect(handleStripeEvent(event)).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('unhandled-type'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('checkout.session.completed sans prospect_id : log error mais ne throw pas', async () => {
    const event = {
      id: 'evt_no_prospect_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          payment_status: 'paid',
          metadata: {},
        },
      },
    } as unknown as Stripe.Event;
    await expect(handleStripeEvent(event)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('checkout-completed-no-prospect-id'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('checkout.session.completed avec payment_status non paid : skip silencieux', async () => {
    const event = {
      id: 'evt_unpaid_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          payment_status: 'unpaid',
          metadata: { prospect_id: 'p1' },
        },
      },
    } as unknown as Stripe.Event;
    await expect(handleStripeEvent(event)).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('checkout-completed-not-paid'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('payment_intent.succeeded : passthrough (Bug A — pas de double email admin)', async () => {
    const event = {
      id: 'evt_pi_passthrough',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test',
          metadata: { prospect_id: 'p1' },
          amount: 1000,
        },
      },
    } as unknown as Stripe.Event;
    await expect(handleStripeEvent(event)).resolves.toBeUndefined();
    const allLogs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(allLogs).toContain('pi-succeeded-passthrough');
    expect(allLogs).toContain('already handled via checkout.session.completed');
  });
});
