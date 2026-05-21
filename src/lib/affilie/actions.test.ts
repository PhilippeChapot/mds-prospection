/**
 * @vitest-environment node
 *
 * P7.x.1.C — tests updateAffiliateBankingAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AFFILIATE_ID = 'aff-test-123';

interface MockState {
  authSucceeds: boolean;
  affiliateBefore: {
    iban: string | null;
    bic: string | null;
    nom_titulaire_compte: string | null;
  } | null;
  affiliateUpdates: Array<Record<string, unknown>>;
  auditInserts: Array<Record<string, unknown>>;
  updateError: { message: string } | null;
}

const state: MockState = {
  authSucceeds: true,
  affiliateBefore: null,
  affiliateUpdates: [],
  auditInserts: [],
  updateError: null,
};

function resetState() {
  state.authSucceeds = true;
  state.affiliateBefore = null;
  state.affiliateUpdates.length = 0;
  state.auditInserts.length = 0;
  state.updateError = null;
}

function mockEnv() {
  vi.doMock('./session', () => ({
    requireAffilieSession: vi.fn(async () => {
      if (!state.authSucceeds) {
        // Reproduit le throw de next/navigation redirect (test interrupts).
        throw new Error('redirect');
      }
      return { affiliateId: AFFILIATE_ID };
    }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'affiliates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.affiliateBefore, error: null }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => {
                state.affiliateUpdates.push(patch);
                return Promise.resolve({ error: state.updateError });
              },
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.auditInserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));

  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
}

describe('updateAffiliateBankingAction (P7.x.1.C)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path : IBAN FR valide -> persiste (uppercase + strip espaces)', async () => {
    mockEnv();
    state.affiliateBefore = { iban: null, bic: null, nom_titulaire_compte: null };
    const { updateAffiliateBankingAction } = await import('./actions');
    const r = await updateAffiliateBankingAction('fr', {
      iban: 'fr76 3000 1007 9412 3456 7890 185',
      bic: 'BNPAFRPP',
      nom_titulaire_compte: 'Lucas Aubrée',
    });
    expect(r.ok).toBe(true);
    expect(state.affiliateUpdates).toHaveLength(1);
    const upd = state.affiliateUpdates[0];
    // Normalise : uppercase + sans espaces
    expect(upd.iban).toBe('FR7630001007941234567890185');
    expect(upd.bic).toBe('BNPAFRPP');
    expect(upd.nom_titulaire_compte).toBe('Lucas Aubrée');
    // Audit log INSERT effectue (RGPD : trace des changements de banking)
    expect(state.auditInserts).toHaveLength(1);
    const audit = state.auditInserts[0];
    expect(audit.entity_type).toBe('affiliates');
    expect(audit.action).toBe('update');
    expect((audit.after as { kind: string }).kind).toBe('banking_update');
  });

  it('refuse IBAN au format invalide (commence par chiffre)', async () => {
    mockEnv();
    const { updateAffiliateBankingAction } = await import('./actions');
    const r = await updateAffiliateBankingAction('fr', {
      iban: '123XXX',
      bic: 'BNPAFRPP',
      nom_titulaire_compte: 'Test',
    });
    expect(r.ok).toBe(false);
    expect(state.affiliateUpdates).toHaveLength(0);
  });

  it('refuse BIC mal forme (5 chars seulement)', async () => {
    mockEnv();
    const { updateAffiliateBankingAction } = await import('./actions');
    const r = await updateAffiliateBankingAction('fr', {
      iban: 'FR7630001007941234567890185',
      bic: 'ABCDE',
      nom_titulaire_compte: 'Test',
    });
    expect(r.ok).toBe(false);
  });

  it('BIC optionnel : string vide accepte + persistee comme NULL', async () => {
    mockEnv();
    const { updateAffiliateBankingAction } = await import('./actions');
    const r = await updateAffiliateBankingAction('fr', {
      iban: 'FR7630001007941234567890185',
      bic: '',
      nom_titulaire_compte: 'Test',
    });
    expect(r.ok).toBe(true);
    expect(state.affiliateUpdates[0].bic).toBeNull();
  });

  it('refuse nom_titulaire_compte trop court (< 2)', async () => {
    mockEnv();
    const { updateAffiliateBankingAction } = await import('./actions');
    const r = await updateAffiliateBankingAction('fr', {
      iban: 'FR7630001007941234567890185',
      bic: 'BNPAFRPP',
      nom_titulaire_compte: 'A',
    });
    expect(r.ok).toBe(false);
  });
});
