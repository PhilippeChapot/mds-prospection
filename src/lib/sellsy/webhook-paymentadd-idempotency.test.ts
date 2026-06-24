/**
 * @vitest-environment node
 *
 * P5.x.ManualPaymentRecording (BUG 1) — idempotence du webhook
 * docslog.paymentadd : skip si le payment_id a déjà été comptabilisé
 * (garde `payment-{id}` dans sellsy_events_processed posée par
 * record-payment-action ou par un précédent passage).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  guardRow: { event_id: string } | null;
  prospectUpdates: Array<Record<string, unknown>>;
  guardUpserts: Array<Record<string, unknown>>;
}
const state: State = { guardRow: null, prospectUpdates: [], guardUpserts: [] };

function mockEnv() {
  vi.doMock('@/lib/resend/admin-notifier', () => ({ sendAdminNotification: vi.fn() }));
  vi.doMock('@/lib/resend/templates/admin-notifications', () => ({
    renderAdminPaymentAddEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
    renderAdminSignatureEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
  }));
  vi.doMock('@/lib/brevo/sync-lifecycle', () => ({
    syncBrevoLifecycle: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/affiliates/maybe-record-commission', () => ({
    maybeRecordAffiliateCommission: vi.fn().mockResolvedValue(undefined),
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
                    data: {
                      id: 'p1',
                      sellsy_devis_id: null,
                      sellsy_proforma_id: null,
                      sellsy_invoice_id: '9001',
                      sellsy_devis_number: 'D-1',
                      sellsy_devis_public_url: null,
                      sellsy_devis_total_ttc: '5000',
                      acompte_amount_eur: 0,
                      company: { name: 'Zero Janvier' },
                    },
                    error: null,
                  }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => {
                state.prospectUpdates.push(patch);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === 'sellsy_events_processed') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.guardRow, error: null }),
              }),
            }),
            upsert: (row: Record<string, unknown>) => {
              state.guardUpserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

beforeEach(() => {
  state.guardRow = null;
  state.prospectUpdates = [];
  state.guardUpserts = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

const baseEvent = {
  eventType: 'docslog',
  event: 'paymentadd',
  relatedid: '9001',
  relatedtype: 'invoice',
  amount: 1485,
  payment_id: 29012736,
};

describe('webhook docslog.paymentadd — idempotence (BUG 1)', () => {
  it('payment_id déjà traité (garde manual_api présente) → skip, pas d’update prospect', async () => {
    state.guardRow = { event_id: 'payment-29012736' };
    mockEnv();
    const { handleSellsyEvent } = await import('./webhook-handler');
    await handleSellsyEvent(baseEvent);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('payment_id inconnu → traitement normal (update prospect + marque la garde)', async () => {
    state.guardRow = null;
    mockEnv();
    const { handleSellsyEvent } = await import('./webhook-handler');
    await handleSellsyEvent(baseEvent);
    expect(state.prospectUpdates).toHaveLength(1);
    expect(state.prospectUpdates[0].acompte_amount_eur).toBe(1485);
    // La garde est posée pour bloquer un futur rejeu.
    expect(state.guardUpserts.some((u) => u.event_id === 'payment-29012736')).toBe(true);
  });
});
