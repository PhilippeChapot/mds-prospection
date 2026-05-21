/**
 * @vitest-environment node
 *
 * P7.x.1.B — tests loadAffilieDashboardData + buildTrackingLinks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTrackingLinks } from './dashboard-data';

describe('buildTrackingLinks (P7.x.1.B, pure)', () => {
  it('genere les 4 liens FR/EN landing + signup avec ?ref=<token>', () => {
    const links = buildTrackingLinks('https://mediadays.solutions', 'LUCAS_AUBREE');
    expect(links).toHaveLength(4);
    expect(links[0]).toEqual({
      id: 'landing-fr',
      labelKey: 'landingFr',
      url: 'https://mediadays.solutions/fr?ref=LUCAS_AUBREE',
    });
    expect(links[1].url).toBe('https://mediadays.solutions/en?ref=LUCAS_AUBREE');
    expect(links[2].url).toBe(
      'https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS_AUBREE',
    );
    expect(links[3].url).toBe(
      'https://mediadays.solutions/en/exhibitor-registration?ref=LUCAS_AUBREE',
    );
  });

  it('nettoie le trailing slash du baseUrl (pas de // dans le path)', () => {
    const links = buildTrackingLinks('https://mediadays.solutions/', 'TOKEN1');
    expect(links[0].url).toBe('https://mediadays.solutions/fr?ref=TOKEN1');
  });

  it('encode le token (caracteres speciaux refuses par URL)', () => {
    // En vrai les tokens sont [A-Z0-9_.\-] mais on est defensif.
    const links = buildTrackingLinks('https://mediadays.solutions', 'A B/C');
    expect(links[0].url).toBe('https://mediadays.solutions/fr?ref=A%20B%2FC');
  });
});

// ---------------------------------------------------------------------------
// loadAffilieDashboardData — mock Supabase chains
// ---------------------------------------------------------------------------

interface AffiliateRow {
  id: string;
  token: string;
  display_name: string;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_phone: string | null;
  type: 'media' | 'referral';
  commission_percent: number;
  iban: string | null;
  bic: string | null;
  nom_titulaire_compte: string | null;
  last_login_at: string | null;
  is_active: boolean;
}

interface ProspectRow {
  id: string;
  status: string;
  acompte_paid_at: string | null;
  sellsy_devis_total_ttc: number | null;
  commission_eur_ht: number | null;
  commission_status: 'not_applicable' | 'due' | 'paid';
  commission_paid_at: string | null;
  commission_payment_reference: string | null;
  company: { name: string | null };
}

interface MockState {
  affiliate: AffiliateRow | null;
  clicks30d: number;
  clicksTotal: number;
  prospects: ProspectRow[];
}

const state: MockState = {
  affiliate: null,
  clicks30d: 0,
  clicksTotal: 0,
  prospects: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'affiliates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.affiliate,
                    error: state.affiliate ? null : { message: 'not found' },
                  }),
              }),
            }),
          };
        }
        if (table === 'affiliate_clicks') {
          // 2 chains : gte() pour 30d, sinon total
          return {
            select: () => ({
              eq: () => ({
                gte: () => Promise.resolve({ count: state.clicks30d, error: null }),
                // chain pour le count total (sans gte)
                then: (resolve: (r: { count: number; error: null }) => void) => {
                  resolve({ count: state.clicksTotal, error: null });
                },
              }),
            }),
          };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: state.prospects, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));
}

function resetState() {
  state.affiliate = null;
  state.clicks30d = 0;
  state.clicksTotal = 0;
  state.prospects = [];
}

describe('loadAffilieDashboardData (P7.x.1.B)', () => {
  beforeEach(() => {
    // Reset modules avant chaque test pour que le vi.doMock du mockEnv()
    // s'applique a un nouvel import du module teste (sinon le 1er test
    // utilise le vrai service client cache d'un test precedent).
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throw si affilie introuvable', async () => {
    mockEnv();
    state.affiliate = null;
    const { loadAffilieDashboardData } = await import('./dashboard-data');
    await expect(loadAffilieDashboardData('aff-missing')).rejects.toThrow(/not found/);
  });

  it('throw si affilie archive (is_active=false)', async () => {
    mockEnv();
    state.affiliate = {
      id: 'aff-1',
      token: 'TEST',
      display_name: 'Test',
      contact_email: 't@t.com',
      contact_first_name: null,
      contact_last_name: null,
      contact_phone: null,
      type: 'media',
      commission_percent: 10,
      iban: null,
      bic: null,
      nom_titulaire_compte: null,
      last_login_at: null,
      is_active: false,
    };
    const { loadAffilieDashboardData } = await import('./dashboard-data');
    await expect(loadAffilieDashboardData('aff-1')).rejects.toThrow(/archived/);
  });

  it('happy path : profile mappe + KPIs agrege correctement', async () => {
    mockEnv();
    state.affiliate = {
      id: 'aff-1',
      token: 'LUCAS',
      display_name: 'Lucas Aubrée',
      contact_email: 'lucas@radiohouse.pro',
      contact_first_name: 'lucas',
      contact_last_name: 'aubrée',
      contact_phone: '+33 6 12 34 56 78',
      type: 'media',
      commission_percent: 10,
      iban: 'FR76...',
      bic: null,
      nom_titulaire_compte: 'Lucas Aubrée',
      last_login_at: '2026-05-21T10:00:00Z',
      is_active: true,
    };
    state.clicks30d = 42;
    state.clicksTotal = 128;
    state.prospects = [
      {
        id: 'p1',
        status: 'acompte_paye',
        acompte_paid_at: '2026-05-10T00:00:00Z',
        sellsy_devis_total_ttc: 12000,
        commission_eur_ht: 1000,
        commission_status: 'paid',
        commission_paid_at: '2026-05-15T00:00:00Z',
        commission_payment_reference: 'VIR-2026-05-15-001',
        company: { name: 'Acme Media' },
      },
      {
        id: 'p2',
        status: 'acompte_paye',
        acompte_paid_at: '2026-05-18T00:00:00Z',
        sellsy_devis_total_ttc: 8000,
        commission_eur_ht: 666,
        commission_status: 'due',
        commission_paid_at: null,
        commission_payment_reference: null,
        company: { name: 'Beta Studio' },
      },
      {
        id: 'p3',
        status: 'lead',
        acompte_paid_at: null,
        sellsy_devis_total_ttc: null,
        commission_eur_ht: null,
        commission_status: 'not_applicable',
        commission_paid_at: null,
        commission_payment_reference: null,
        company: { name: 'Gamma Group' },
      },
    ];

    const { loadAffilieDashboardData } = await import('./dashboard-data');
    const data = await loadAffilieDashboardData('aff-1');

    // Profile : capitalize, mapping correct
    expect(data.profile.displayName).toBe('Lucas Aubrée');
    expect(data.profile.contactFirstName).toBe('Lucas');
    expect(data.profile.contactLastName).toBe('Aubrée');
    expect(data.profile.commissionPercent).toBe(10);
    expect(data.profile.iban).toBe('FR76...');

    // KPIs
    expect(data.kpis.clicks30d).toBe(42);
    expect(data.kpis.clicksTotal).toBe(128);
    expect(data.kpis.prospectsCount).toBe(3);
    expect(data.kpis.convertedCount).toBe(2);
    expect(data.kpis.commissionDueEur).toBe(666);
    expect(data.kpis.commissionPaidEur).toBe(1000);

    // Tri commissions : due d'abord, puis paid, puis not_applicable
    expect(data.commissions.map((c) => c.commissionStatus)).toEqual([
      'due',
      'paid',
      'not_applicable',
    ]);
    expect(data.commissions[0].companyName).toBe('Beta Studio');
    expect(data.commissions[1].companyName).toBe('Acme Media');
  });
});
