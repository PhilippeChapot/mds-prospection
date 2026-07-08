/**
 * @vitest-environment node
 *
 * Incident 2026-07-08 (Fabrice GAUTHIER / Broadcast-Associés) — smoke tests
 * GET /regler-acompte/[prospectId].
 *
 * Cas couverts :
 *   - lien cache encore valide          -> 302 vers l'URL stockee, pas d'appel Stripe.
 *   - lien absent/expire                -> regenere via createAcomptePaymentLink, 302 vers l'URL fraiche.
 *   - payment_path != devis_acompte_stripe (SEPA, proforma, facture, ou
 *     null comme le prospect Broadcast-Associés / Case B) -> redirect gracieux, pas d'appel Stripe.
 *   - prospect inexistant                -> redirect gracieux (jamais de 404 brute).
 *   - createAcomptePaymentLink echoue    -> redirect gracieux, pas de throw non catche.
 *   - acompte deja paye                  -> redirect gracieux, pas d'appel Stripe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type FakeProspect = Record<string, unknown>;

const prospectsById = new Map<string, FakeProspect>();

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: () => Promise.resolve({ data: prospectsById.get(val) ?? null, error: null }),
        }),
      }),
    }),
  }),
}));

const createAcomptePaymentLink = vi.fn();
vi.mock('@/lib/stripe/payment-link', () => ({
  createAcomptePaymentLink: (...args: unknown[]) => createAcomptePaymentLink(...args),
}));

beforeEach(() => {
  prospectsById.clear();
  createAcomptePaymentLink.mockReset();
});

function makeRequest(prospectId: string): NextRequest {
  return new NextRequest(`http://localhost/regler-acompte/${prospectId}`);
}

describe('GET /regler-acompte/[prospectId]', () => {
  it('lien cache encore valide -> 302 vers l URL stockee, pas d appel Stripe', async () => {
    prospectsById.set('p1', {
      id: 'p1',
      is_test: false,
      payment_path: 'devis_acompte_stripe',
      acompte_status: 'pending',
      acompte_payment_link_url: 'https://buy.stripe.com/cached-link',
      acompte_payment_link_expires_at: new Date(Date.now() + 10 * 86400_000).toISOString(),
      sellsy_devis_total_ttc: 2970,
      sellsy_devis_number: 'D-20260624-02717',
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest('p1'), { params: Promise.resolve({ prospectId: 'p1' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://buy.stripe.com/cached-link');
    expect(createAcomptePaymentLink).not.toHaveBeenCalled();
  });

  it('lien absent/expire -> regenere via createAcomptePaymentLink, 302 vers URL fraiche', async () => {
    prospectsById.set('p2', {
      id: 'p2',
      is_test: false,
      payment_path: 'devis_acompte_stripe',
      acompte_status: 'pending',
      acompte_payment_link_url: 'https://buy.stripe.com/old-deactivated-link',
      acompte_payment_link_expires_at: new Date(Date.now() - 86400_000).toISOString(),
      sellsy_devis_total_ttc: 2970,
      sellsy_devis_number: 'D-20260624-02717',
    });
    createAcomptePaymentLink.mockResolvedValue({
      paymentLinkId: 'plink_fresh',
      url: 'https://buy.stripe.com/fresh-link',
      expiresAt: new Date().toISOString(),
      amountCents: 89100,
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest('p2'), { params: Promise.resolve({ prospectId: 'p2' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://buy.stripe.com/fresh-link');
    expect(createAcomptePaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: 'p2', devisNumber: 'D-20260624-02717' }),
    );
  });

  it("payment_path=null (Case B, ex: Broadcast-Associes) -> redirect gracieux, pas d'appel Stripe", async () => {
    prospectsById.set('p3', {
      id: 'p3',
      is_test: false,
      payment_path: null,
      acompte_status: 'not_required',
      acompte_payment_link_url: null,
      acompte_payment_link_expires_at: null,
      sellsy_devis_total_ttc: 2970,
      sellsy_devis_number: 'D-20260624-02717',
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest('p3'), { params: Promise.resolve({ prospectId: 'p3' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).not.toContain('stripe.com');
    expect(createAcomptePaymentLink).not.toHaveBeenCalled();
  });

  it('prospect inexistant -> redirect gracieux (jamais de 404 brute)', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('ghost'), {
      params: Promise.resolve({ prospectId: 'ghost' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).not.toContain('stripe.com');
  });

  it('createAcomptePaymentLink echoue -> redirect gracieux, pas de throw', async () => {
    prospectsById.set('p4', {
      id: 'p4',
      is_test: false,
      payment_path: 'devis_acompte_stripe',
      acompte_status: 'pending',
      acompte_payment_link_url: null,
      acompte_payment_link_expires_at: null,
      sellsy_devis_total_ttc: 2970,
      sellsy_devis_number: 'D-20260624-02717',
    });
    createAcomptePaymentLink.mockRejectedValue(new Error('Stripe API down'));

    const { GET } = await import('./route');
    const res = await GET(makeRequest('p4'), { params: Promise.resolve({ prospectId: 'p4' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).not.toContain('stripe.com');
  });

  it('acompte deja paye -> redirect gracieux, pas d appel Stripe', async () => {
    prospectsById.set('p5', {
      id: 'p5',
      is_test: false,
      payment_path: 'devis_acompte_stripe',
      acompte_status: 'paid',
      acompte_payment_link_url: 'https://buy.stripe.com/already-paid-link',
      acompte_payment_link_expires_at: new Date(Date.now() + 10 * 86400_000).toISOString(),
      sellsy_devis_total_ttc: 2970,
      sellsy_devis_number: 'D-20260624-02717',
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest('p5'), { params: Promise.resolve({ prospectId: 'p5' }) });

    expect(res.status).toBe(302);
    expect(createAcomptePaymentLink).not.toHaveBeenCalled();
  });
});
