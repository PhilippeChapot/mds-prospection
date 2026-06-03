/**
 * @vitest-environment node
 *
 * P6.x.1b-δ — tests POST /api/admin/debug/supplementary/[id]/simulate-paid.
 *
 * Couvre :
 *   - 403 si role !== 'admin' (sales rejeté)
 *   - 400 si order pas en pending (already paid)
 *   - 200 + appel processPaidSupplementaryOrder avec le bon id + pi_simulated_*
 *   - is_test=true → side_effects reflètent les skips (gate γ préservée)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const procMock = vi.fn();

interface OrderRow {
  id: string;
  status: 'pending' | 'paid' | 'failed';
}

function mockEnv(opts: {
  profile?: { id: string; role: 'admin' | 'sales'; email: string };
  order?: OrderRow | null;
  processResult?: Awaited<
    ReturnType<
      typeof import('@/lib/espace-partenaire/supplementary-orders/webhook-handler').processPaidSupplementaryOrder
    >
  >;
}) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve(opts.profile ?? { id: 'u', role: 'admin', email: 'a@b' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.order ?? null, error: null }),
          }),
        }),
      }),
    }),
  }));

  procMock.mockReset();
  procMock.mockResolvedValue(
    opts.processResult ?? {
      status: 'paid',
      order_id: 'order-1',
      sellsy_facture_id: 999,
      sellsy_facture_number: 'F-2026-001',
      side_effects: {
        facture_skipped: false,
        facture_skipped_reason: null,
        email_client_skipped: false,
        email_client_skipped_reason: null,
        admin_email_test_prefix: false,
        brevo_skipped: false,
        brevo_skipped_reason: null,
      },
    },
  );

  vi.doMock('@/lib/espace-partenaire/supplementary-orders/webhook-handler', () => ({
    processPaidSupplementaryOrder: procMock,
  }));
}

describe('POST /api/admin/debug/supplementary/[id]/simulate-paid (P6.x.1b-δ)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns 403 if profile role !== admin (sales rejected)', async () => {
    mockEnv({
      profile: { id: 'u', role: 'sales', email: 's@b' },
      order: { id: 'order-1', status: 'pending' },
    });
    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/'), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    expect(res.status).toBe(403);
    expect(procMock).not.toHaveBeenCalled();
  });

  it('returns 400 if order status !== pending (already paid)', async () => {
    mockEnv({
      order: { id: 'order-1', status: 'paid' },
    });
    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/'), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; current_status: string };
    expect(json.error).toMatch(/not pending/i);
    expect(json.current_status).toBe('paid');
    expect(procMock).not.toHaveBeenCalled();
  });

  it('returns 200 + invokes processPaidSupplementaryOrder once with pi_simulated_*', async () => {
    mockEnv({
      order: { id: 'order-42', status: 'pending' },
    });
    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/'), {
      params: Promise.resolve({ id: 'order-42' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      order_id: string;
      status: string;
      sellsy_facture_id: number | null;
    };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('paid');
    expect(json.sellsy_facture_id).toBe(999);

    expect(procMock).toHaveBeenCalledTimes(1);
    const [calledId, calledCtx] = procMock.mock.calls[0] as [
      string,
      { stripePaymentIntentId: string; stripeSessionId: string | null },
    ];
    expect(calledId).toBe('order-42');
    expect(calledCtx.stripePaymentIntentId).toMatch(/^pi_simulated_/);
    expect(calledCtx.stripeSessionId).toBeNull();
  });

  it('preserves is_test gate : side_effects reflect facture/email/brevo skipped', async () => {
    mockEnv({
      order: { id: 'order-test', status: 'pending' },
      processResult: {
        status: 'paid',
        order_id: 'order-test',
        sellsy_facture_id: null,
        sellsy_facture_number: null,
        side_effects: {
          facture_skipped: true,
          facture_skipped_reason: 'is_test',
          email_client_skipped: true,
          email_client_skipped_reason: 'is_test',
          admin_email_test_prefix: true,
          brevo_skipped: true,
          brevo_skipped_reason: 'is_test',
        },
      },
    });
    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/'), {
      params: Promise.resolve({ id: 'order-test' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      side_effects: {
        facture_skipped: boolean;
        email_client_skipped: boolean;
        brevo_skipped: boolean;
        admin_email_test_prefix: boolean;
      };
      sellsy_facture_id: number | null;
    };
    expect(json.side_effects.facture_skipped).toBe(true);
    expect(json.side_effects.email_client_skipped).toBe(true);
    expect(json.side_effects.brevo_skipped).toBe(true);
    expect(json.side_effects.admin_email_test_prefix).toBe(true);
    expect(json.sellsy_facture_id).toBeNull();
  });
});
