/**
 * @vitest-environment node
 *
 * P5.x.3 S3 — tests cron cleanup-payment-links.
 *
 * Couvre :
 *   - sans CRON_SECRET ou Bearer absent -> 401
 *   - 0 lien expire en DB -> { deactivated: 0, errors: 0 }
 *   - 3 liens expires -> stripe.paymentLinks.update appele 3 fois
 *   - 1 fail Stripe sur 3 -> { deactivated: 2, errors: 1 } (continue)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GET /api/cron/cleanup-payment-links (P5.x.3 S3)', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockSupabase(rows: Array<{ id: string; acompte_payment_link_id: string }>) {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            not: () => ({
              lt: () => ({
                is: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
  }

  it('sans Bearer header -> 401', async () => {
    const { GET } = await import('./route');
    const req = new Request('http://x/api/cron/cleanup-payment-links');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('Bearer mauvais secret -> 401', async () => {
    const { GET } = await import('./route');
    const req = new Request('http://x', {
      headers: { authorization: 'Bearer wrong' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('0 lien expire -> { deactivated: 0, errors: 0 }', async () => {
    mockSupabase([]);
    const updateMock = vi.fn();
    vi.doMock('@/lib/stripe/client', () => ({
      getStripe: () => ({ paymentLinks: { update: updateMock } }),
    }));
    const { GET } = await import('./route');
    const req = new Request('http://x', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deactivated: 0, errors: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('3 liens expires -> stripe.update appele 3 fois avec active=false', async () => {
    mockSupabase([
      { id: 'p1', acompte_payment_link_id: 'plink_1' },
      { id: 'p2', acompte_payment_link_id: 'plink_2' },
      { id: 'p3', acompte_payment_link_id: 'plink_3' },
    ]);
    const updateMock = vi.fn().mockResolvedValue({ id: 'plink_x', active: false });
    vi.doMock('@/lib/stripe/client', () => ({
      getStripe: () => ({ paymentLinks: { update: updateMock } }),
    }));
    const { GET } = await import('./route');
    const req = new Request('http://x', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deactivated: 3, errors: 0 });
    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(updateMock).toHaveBeenCalledWith('plink_1', { active: false });
    expect(updateMock).toHaveBeenCalledWith('plink_2', { active: false });
    expect(updateMock).toHaveBeenCalledWith('plink_3', { active: false });
  });

  it('1 fail Stripe sur 3 -> { deactivated: 2, errors: 1 } (continue le batch)', async () => {
    mockSupabase([
      { id: 'p1', acompte_payment_link_id: 'plink_1' },
      { id: 'p2', acompte_payment_link_id: 'plink_2' },
      { id: 'p3', acompte_payment_link_id: 'plink_3' },
    ]);
    const updateMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 'plink_1' })
      .mockRejectedValueOnce(new Error('Stripe boom'))
      .mockResolvedValueOnce({ id: 'plink_3' });
    vi.doMock('@/lib/stripe/client', () => ({
      getStripe: () => ({ paymentLinks: { update: updateMock } }),
    }));
    const { GET } = await import('./route');
    const req = new Request('http://x', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deactivated: 2, errors: 1 });
    expect(updateMock).toHaveBeenCalledTimes(3);
  });

  it('DB error -> 500', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            not: () => ({
              lt: () => ({
                is: () => Promise.resolve({ data: null, error: { message: 'db down' } }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { GET } = await import('./route');
    const req = new Request('http://x', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
