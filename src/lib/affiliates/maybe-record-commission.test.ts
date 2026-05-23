/**
 * @vitest-environment node
 *
 * P7.x.1.D — tests integration : exclusion commission pour
 * companies.category='prs_exhibitor'.
 *
 * On mock supabase service + resend/template imports pour isoler la
 * logique de eligibility. Focus : verifier l'UPDATE { commission_eur_ht:
 * 0, commission_status: 'not_applicable' } ET l'absence d'email.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PROSPECT_ID = 'p-aaa';
const AFFILIATE_ID = 'aff-1';

interface ProspectRow {
  id: string;
  affiliate_id: string;
  sellsy_devis_total_ttc: number | null;
  commission_eur_ht: number | null;
  company: {
    name: string;
    category: 'prs_exhibitor' | 'standard' | 'non_eligible' | null;
    vat_country: string | null;
    vat_verified: boolean | null;
  };
}

interface MockState {
  prospect: ProspectRow | null;
  prospectUpdates: Array<Record<string, unknown>>;
  resendCalls: number;
  affiliateContactEmail: string | null;
}

const state: MockState = {
  prospect: null,
  prospectUpdates: [],
  resendCalls: 0,
  affiliateContactEmail: 'aff@example.com',
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.prospect,
                    error: state.prospect ? null : { message: 'not found' },
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
        if (table === 'affiliates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: AFFILIATE_ID,
                      commission_percent: 10,
                      display_name: 'Test Affilie',
                      contact_email: state.affiliateContactEmail,
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));
  vi.doMock('@/lib/vies/verify', () => ({
    isAutoliquidationApplicable: () => false,
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async () => {
      state.resendCalls += 1;
      return { id: 'res-1' };
    }),
  }));
}

describe('maybeRecordAffiliateCommission — exclusion PRS (P7.x.1.D)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.prospect = null;
    state.prospectUpdates = [];
    state.resendCalls = 0;
    state.affiliateContactEmail = 'aff@example.com';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("company.category='prs_exhibitor' -> UPDATE commission_eur_ht=0 + status='not_applicable' + AUCUN email", async () => {
    mockEnv();
    state.prospect = {
      id: PROSPECT_ID,
      affiliate_id: AFFILIATE_ID,
      sellsy_devis_total_ttc: 12000,
      commission_eur_ht: null,
      company: {
        name: 'Radio France',
        category: 'prs_exhibitor',
        vat_country: 'FR',
        vat_verified: true,
      },
    };
    const { maybeRecordAffiliateCommission } = await import('./maybe-record-commission');
    await maybeRecordAffiliateCommission(PROSPECT_ID);

    // 1 seul UPDATE, avec amount=0 + status=not_applicable
    expect(state.prospectUpdates).toHaveLength(1);
    expect(state.prospectUpdates[0]).toEqual({
      commission_eur_ht: 0,
      commission_status: 'not_applicable',
    });
    // PAS de write sur notes (preserve les notes commerciales)
    expect(state.prospectUpdates[0]).not.toHaveProperty('notes');
    // PAS d'email envoye (ce n'est pas une commission gagnee)
    expect(state.resendCalls).toBe(0);
  });

  it("company.category='standard' -> calcul normal (NON-skipped + email envoye)", async () => {
    mockEnv();
    state.prospect = {
      id: PROSPECT_ID,
      affiliate_id: AFFILIATE_ID,
      sellsy_devis_total_ttc: 12000,
      commission_eur_ht: null,
      company: {
        name: 'Acme Standard',
        category: 'standard',
        vat_country: 'FR',
        vat_verified: true,
      },
    };
    const { maybeRecordAffiliateCommission } = await import('./maybe-record-commission');
    await maybeRecordAffiliateCommission(PROSPECT_ID);

    // UPDATE avec status='due' (pas 'not_applicable')
    expect(state.prospectUpdates).toHaveLength(1);
    expect(state.prospectUpdates[0].commission_status).toBe('due');
    expect(Number(state.prospectUpdates[0].commission_eur_ht)).toBeGreaterThan(0);
    // Email envoye apres calcul
    expect(state.resendCalls).toBe(1);
  });
});
