/**
 * @vitest-environment node
 *
 * P5.x.ManualPaymentRecording — tests recordManualPaymentAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  role: 'admin' | 'sales';
  prospect: Record<string, unknown> | null;
  prospectUpdates: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  sellsyResult: { paymentId: number | null; error: string | null };
  sellsyCalls: Array<Record<string, unknown>>;
  guardUpserts: Array<Record<string, unknown>>;
}

const PID = '11111111-1111-4111-8111-111111111111';

const state: State = {
  role: 'admin',
  prospect: null,
  prospectUpdates: [],
  audits: [],
  sellsyResult: { paymentId: 555, error: null },
  sellsyCalls: [],
  guardUpserts: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: state.role, email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/admin/stands/actions', () => ({
    syncStandStatusFromProspect: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/brevo/sync-lifecycle', () => ({
    syncBrevoLifecycle: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/sellsy/payments', () => ({
    notifySellsyPaymentReceived: vi.fn(async (input: Record<string, unknown>) => {
      state.sellsyCalls.push(input);
      return state.sellsyResult;
    }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.prospect, error: null }),
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
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.audits.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        if (table === 'sellsy_events_processed') {
          return {
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

function baseProspect(over: Record<string, unknown> = {}) {
  return {
    id: PID,
    status: 'signe',
    acompte_amount_eur: null,
    sellsy_devis_total_ttc: null,
    sellsy_invoice_id: '9001',
    sellsy_proforma_id: null,
    sellsy_devis_id: '8001',
    ...over,
  };
}

beforeEach(() => {
  state.role = 'admin';
  state.prospect = baseProspect();
  state.prospectUpdates = [];
  state.audits = [];
  state.sellsyResult = { paymentId: 555, error: null };
  state.sellsyCalls = [];
  state.guardUpserts = [];
  vi.stubEnv('SELLSY_PAYMENT_METHOD_ID_VIREMENT', '43504');
  vi.stubEnv('SELLSY_PAYMENT_METHOD_ID_CHEQUE', '43503');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

const baseInput = {
  prospect_id: PID,
  amount_ttc: 1000,
  paid_at: '2026-06-24',
  reference: 'VIR-001',
};

describe('recordManualPaymentAction (P5.x)', () => {
  it('acompte virement, montant < total devis → Sellsy appelé + acompte_amount_eur incrémenté + status=acompte_paye', async () => {
    state.prospect = baseProspect({ sellsy_devis_total_ttc: '3000' });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.sellsyCalls).toHaveLength(1);
    expect(state.sellsyCalls[0].paymentMethodId).toBe(43504);
    expect(state.sellsyCalls[0].documentType).toBe('invoice'); // priorité facture
    const upd = state.prospectUpdates[0];
    expect(upd.acompte_amount_eur).toBe(1000);
    expect(upd.status).toBe('acompte_paye');
  });

  it('solde, montant atteint le total devis → status=paye_integral', async () => {
    state.prospect = baseProspect({ sellsy_devis_total_ttc: '1000' });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'solde',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates[0].status).toBe('paye_integral');
  });

  it("dropdown 'acompte' mais montant cumulé atteint le total → status=paye_integral quand même", async () => {
    // Le statut doit refléter le montant réel, pas le libellé choisi dans le
    // dropdown : un admin qui sélectionne "acompte" par erreur (ou parce que
    // c'est le dernier acompte qui solde le devis) ne doit pas laisser le
    // prospect bloqué en 'acompte_paye'.
    state.prospect = baseProspect({ sellsy_devis_total_ttc: '1000' });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates[0].status).toBe('paye_integral');
  });

  it("dropdown 'solde' mais montant cumulé partiel → reste acompte_paye", async () => {
    state.prospect = baseProspect({ sellsy_devis_total_ttc: '5000' });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'solde',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates[0].status).toBe('acompte_paye');
  });

  it('devis total TTC inconnu → conservateur, reste acompte_paye même en solde', async () => {
    state.prospect = baseProspect({ sellsy_devis_total_ttc: null });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'solde',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.prospectUpdates[0].status).toBe('acompte_paye');
  });

  it('ajustement → ni status ni acompte_amount_eur touchés', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'ajustement',
      method: 'virement',
    });
    expect(r.ok).toBe(true);
    expect(state.sellsyCalls).toHaveLength(1); // paiement Sellsy quand même enregistré
    expect(state.prospectUpdates).toHaveLength(0); // mais aucune maj prospect
  });

  it('méthode sans env var configurée → erreur explicite', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'especes', // SELLSY_PAYMENT_METHOD_ID_ESPECES non stubbé
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SELLSY_PAYMENT_METHOD_ID_ESPECES/);
    expect(state.sellsyCalls).toHaveLength(0);
  });

  it('prospect sans facture ni devis Sellsy → erreur', async () => {
    state.prospect = baseProspect({
      sellsy_invoice_id: null,
      sellsy_proforma_id: null,
      sellsy_devis_id: null,
    });
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'virement',
    });
    expect(r.ok).toBe(false);
    expect(state.sellsyCalls).toHaveLength(0);
  });

  it('Sellsy create échoue → erreur sans modifier le prospect', async () => {
    state.sellsyResult = { paymentId: null, error: 'open beta 503' };
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'virement',
    });
    expect(r.ok).toBe(false);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('also_update_status=false → skip update statut', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    const r = await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'virement',
      also_update_status: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status_updated).toBe(false);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('BUG2 : updated_at posé sur le prospect', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    await recordManualPaymentAction({ ...baseInput, payment_type: 'acompte', method: 'virement' });
    expect(typeof state.prospectUpdates[0].updated_at).toBe('string');
  });

  it('BUG3 : acompte_status=paid posé pour un acompte', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    await recordManualPaymentAction({ ...baseInput, payment_type: 'acompte', method: 'virement' });
    expect(state.prospectUpdates[0].acompte_status).toBe('paid');
  });

  it('BUG1 : garde idempotence — upsert payment-{id} dans sellsy_events_processed', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    await recordManualPaymentAction({ ...baseInput, payment_type: 'acompte', method: 'virement' });
    expect(state.guardUpserts).toHaveLength(1);
    expect(state.guardUpserts[0].event_id).toBe('payment-555');
    expect(state.guardUpserts[0].event_type).toBe('payment_via_api');
  });

  it('audit log contient sellsy_collection + sellsy_doc_id + reference', async () => {
    mockEnv();
    const { recordManualPaymentAction } = await import('./record-payment-action');
    await recordManualPaymentAction({
      ...baseInput,
      payment_type: 'acompte',
      method: 'cheque',
    });
    const after = state.audits[0].after as Record<string, unknown>;
    expect(after.kind).toBe('manual_payment_recorded');
    expect(after.sellsy_collection).toBe('invoices');
    expect(after.sellsy_doc_id).toBe('9001');
    expect(after.reference).toBe('VIR-001');
  });
});
