/**
 * P5.x.23 — tests recheckCompanySirenForProspect.
 *
 * Validation :
 *   - skip si company.country !== 'FR'
 *   - skip si company.siren déjà set
 *   - auto-match → UPDATE company.siren
 *   - ambiguous → UPSERT admin_alerts
 *   - no match → no-op
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

interface MockState {
  company: { id: string; name: string; country: string | null; siren: string | null } | null;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
  upserts: Array<{ table: string; payload: Record<string, unknown> }>;
}

function mockSupabase(state: MockState) {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.company, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          state.updates.push({ table, patch });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        upsert: (payload: Record<string, unknown>) => {
          state.upserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }));
}

function mockSireneAuto(siret: string) {
  vi.doMock('./sirene', async () => {
    const actual = await vi.importActual<typeof import('./sirene')>('./sirene');
    return {
      ...actual,
      autoMatchSiren: vi.fn().mockResolvedValue({
        auto: true,
        ambiguous: false,
        siren: siret.slice(0, 9),
        siret,
        etablissement: {},
      }),
    };
  });
}

function mockSireneAmbiguous(count: number) {
  const candidates = Array.from({ length: count }, (_, i) => ({
    siren: String(i).padStart(9, '0'),
    siret: String(i).padStart(14, '0'),
    etablissementSiege: false,
    uniteLegale: { denominationUniteLegale: `Co ${i}` },
    adresseEtablissement: {
      libelleCommuneEtablissement: 'PARIS',
      numeroVoieEtablissement: null,
      typeVoieEtablissement: null,
      libelleVoieEtablissement: null,
      codePostalEtablissement: '75001',
    },
  }));
  vi.doMock('./sirene', async () => {
    const actual = await vi.importActual<typeof import('./sirene')>('./sirene');
    return {
      ...actual,
      autoMatchSiren: vi.fn().mockResolvedValue({
        auto: false,
        ambiguous: true,
        candidates,
      }),
    };
  });
}

function mockSireneNoMatch() {
  vi.doMock('./sirene', async () => {
    const actual = await vi.importActual<typeof import('./sirene')>('./sirene');
    return { ...actual, autoMatchSiren: vi.fn().mockResolvedValue(null) };
  });
}

function makeState(company: MockState['company']): MockState {
  return { company, updates: [], upserts: [] };
}

describe('recheckCompanySirenForProspect (P5.x.23)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('skips when company country is not FR', async () => {
    const state = makeState({ id: 'c1', name: 'X', country: 'DE', siren: null });
    mockSupabase(state);
    mockSireneAuto('11111111100001');
    const { recheckCompanySirenForProspect } = await import('./recheck-prospect-siren');
    await recheckCompanySirenForProspect('c1', 'p1');
    expect(state.updates).toEqual([]);
    expect(state.upserts).toEqual([]);
  });

  it('skips when siren already set', async () => {
    const state = makeState({ id: 'c1', name: 'X', country: 'FR', siren: '123456789' });
    mockSupabase(state);
    mockSireneAuto('11111111100001');
    const { recheckCompanySirenForProspect } = await import('./recheck-prospect-siren');
    await recheckCompanySirenForProspect('c1', 'p1');
    expect(state.updates).toEqual([]);
  });

  it('updates company when SIRENE auto-match', async () => {
    const state = makeState({ id: 'c1', name: 'Acme', country: 'FR', siren: null });
    mockSupabase(state);
    mockSireneAuto('11111111100001');
    const { recheckCompanySirenForProspect } = await import('./recheck-prospect-siren');
    await recheckCompanySirenForProspect('c1', 'p1');
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]?.patch.siren).toBe('111111111');
    expect(state.updates[0]?.patch.siren_source).toBe('insee_auto');
  });

  it('inserts admin_alerts when SIRENE ambiguous', async () => {
    const state = makeState({ id: 'c1', name: 'Acme', country: 'FR', siren: null });
    mockSupabase(state);
    mockSireneAmbiguous(3);
    const { recheckCompanySirenForProspect } = await import('./recheck-prospect-siren');
    await recheckCompanySirenForProspect('c1', 'p1');
    expect(state.upserts).toHaveLength(1);
    const upsert = state.upserts[0]?.payload as {
      kind: string;
      prospect_id: string;
      details: { candidates: unknown[] };
    };
    expect(upsert.kind).toBe('siren_ambiguous');
    expect(upsert.prospect_id).toBe('p1');
    expect(upsert.details.candidates).toHaveLength(3);
  });

  it('no-op when SIRENE returns null (not registered)', async () => {
    const state = makeState({ id: 'c1', name: 'NoMatch', country: 'FR', siren: null });
    mockSupabase(state);
    mockSireneNoMatch();
    const { recheckCompanySirenForProspect } = await import('./recheck-prospect-siren');
    await recheckCompanySirenForProspect('c1', 'p1');
    expect(state.updates).toEqual([]);
    expect(state.upserts).toEqual([]);
  });
});
