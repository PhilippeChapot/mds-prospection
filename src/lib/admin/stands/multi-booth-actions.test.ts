/**
 * @vitest-environment node
 *
 * P6.x.MultiBooths — tests setProspectBoothsAction + searchProspectsForBoothAssign.
 *
 * Couvre :
 *   - assign 3 blocs sur prospect vide → 3 OK
 *   - assign 5 blocs (replace) sur prospect qui en avait 2 → 5 total, 3 nouveaux
 *   - append : 2 existants + 2 ajoutés → 4 total, aucun retiré
 *   - unassign total (booth_ids []) → 0 + booth_assignment null
 *   - bloc déjà pris par un autre prospect → refus
 *   - bloc bloqué → refus
 *   - prospect 'perdu' → refus d'assignation
 *   - RBAC : sales OK, viewer refusé
 *   - audit_log 'prospect_booths_changed' (assigned/unassigned/total_count)
 *   - recalcul booth_assignment = liste jointe triée
 *   - searchProspectsForBoothAssign : filtre par nom de société
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PROSPECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROSPECT_ID = '22222222-2222-4222-8222-222222222222';
const B1 = 'aaaaaaaa-0001-4001-8001-000000000001';
const B2 = 'aaaaaaaa-0002-4002-8002-000000000002';
const B3 = 'aaaaaaaa-0003-4003-8003-000000000003';
const B4 = 'aaaaaaaa-0004-4004-8004-000000000004';
const B5 = 'aaaaaaaa-0005-4005-8005-000000000005';

interface StandRow {
  id: string;
  number: string;
  status: 'libre' | 'reserve' | 'paye' | 'bloque';
  prospect_id: string | null;
}

interface ProspectRow {
  id: string;
  status: string;
  is_test: boolean;
  company_name: string;
}

interface MockState {
  profileRole: 'admin' | 'sales' | 'viewer';
  prospects: Map<string, ProspectRow>;
  stands: Map<string, StandRow>;
  standUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  prospectUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  auditInserts: Array<Record<string, unknown>>;
}

const state: MockState = {
  profileRole: 'admin',
  prospects: new Map(),
  stands: new Map(),
  standUpdates: [],
  prospectUpdates: [],
  auditInserts: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve({ id: 'actor-1', role: state.profileRole, email: 'a@b' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'stands') {
          const applyPatch = (id: string, patch: Record<string, unknown>) => {
            const existing = state.stands.get(id);
            if (existing) {
              state.stands.set(id, {
                ...existing,
                ...(patch.status !== undefined
                  ? { status: patch.status as StandRow['status'] }
                  : {}),
                ...(patch.prospect_id !== undefined
                  ? { prospect_id: patch.prospect_id as string | null }
                  : {}),
              });
            }
            state.standUpdates.push({ id, patch });
          };
          return {
            select: () => ({
              eq: (col: string, val: string) => {
                const rows = Array.from(state.stands.values()).filter(
                  (s) => (s as unknown as Record<string, unknown>)[col] === val,
                );
                return {
                  then: (resolve: (v: { data: StandRow[]; error: null }) => unknown) =>
                    resolve({ data: rows, error: null }),
                };
              },
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: Array.from(state.stands.values()).filter((s) => ids.includes(s.id)),
                  error: null,
                }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                applyPatch(id, patch);
                return Promise.resolve({ error: null });
              },
              in: (_col: string, ids: string[]) => {
                for (const id of ids) applyPatch(id, patch);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => {
                const base = state.prospects.get(val);
                return {
                  maybeSingle: () => Promise.resolve({ data: base ?? null, error: null }),
                  // chaîne recherche : .eq('is_test',false).not(...).limit(...)
                  not: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: Array.from(state.prospects.values()).map((p) => ({
                          id: p.id,
                          status: p.status,
                          company: { name: p.company_name },
                        })),
                        error: null,
                      }),
                  }),
                };
              },
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                state.prospectUpdates.push({ id, patch });
                return Promise.resolve({ error: null });
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

function reset() {
  state.profileRole = 'admin';
  state.prospects.clear();
  state.stands.clear();
  state.standUpdates.length = 0;
  state.prospectUpdates.length = 0;
  state.auditInserts.length = 0;
}

function seedStand(id: string, number: string, over: Partial<StandRow> = {}) {
  state.stands.set(id, { id, number, status: 'libre', prospect_id: null, ...over });
}

describe('setProspectBoothsAction (P6.x.MultiBooths)', () => {
  beforeEach(() => {
    reset();
    state.prospects.set(PROSPECT_ID, {
      id: PROSPECT_ID,
      status: 'devis_envoye',
      is_test: false,
      company_name: 'Acme',
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('assign 3 blocs sur prospect vide → 3 OK + status reserve', async () => {
    seedStand(B1, 'A1');
    seedStand(B2, 'A2');
    seedStand(B3, 'A3');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1, B2, B3] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total_count).toBe(3);
      expect(r.data.assigned.sort()).toEqual([B1, B2, B3].sort());
      expect(r.data.unassigned).toHaveLength(0);
    }
    expect(state.stands.get(B1)?.prospect_id).toBe(PROSPECT_ID);
    expect(state.stands.get(B1)?.status).toBe('reserve');
  });

  it('replace 5 blocs sur prospect qui en avait 2 → 3 nouveaux + 2 conservés', async () => {
    seedStand(B1, 'A1', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B2, 'A2', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B3, 'A3');
    seedStand(B4, 'A4');
    seedStand(B5, 'A5');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({
      prospect_id: PROSPECT_ID,
      booth_ids: [B1, B2, B3, B4, B5],
      mode: 'replace',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total_count).toBe(5);
      expect(r.data.assigned.sort()).toEqual([B3, B4, B5].sort());
      expect(r.data.unassigned).toHaveLength(0);
    }
  });

  it('append : 2 existants + 2 ajoutés → 4 total, aucun retiré', async () => {
    seedStand(B1, 'A1', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B2, 'A2', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B3, 'A3');
    seedStand(B4, 'A4');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({
      prospect_id: PROSPECT_ID,
      booth_ids: [B3, B4],
      mode: 'append',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total_count).toBe(4);
      expect(r.data.assigned.sort()).toEqual([B3, B4].sort());
      expect(r.data.unassigned).toHaveLength(0);
    }
    expect(state.stands.get(B1)?.prospect_id).toBe(PROSPECT_ID);
  });

  it('unassign total (booth_ids []) → 0 + booth_assignment null', async () => {
    seedStand(B1, 'A1', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B2, 'A2', { status: 'reserve', prospect_id: PROSPECT_ID });
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total_count).toBe(0);
      expect(r.data.unassigned.sort()).toEqual([B1, B2].sort());
    }
    expect(state.stands.get(B1)?.prospect_id).toBe(null);
    expect(state.stands.get(B1)?.status).toBe('libre');
    const upd = state.prospectUpdates.find((u) => u.id === PROSPECT_ID);
    expect(upd?.patch.booth_assignment).toBe(null);
  });

  it('recalcul booth_assignment = liste jointe triée', async () => {
    seedStand(B1, 'A10');
    seedStand(B2, 'A2');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1, B2] });
    expect(r.ok).toBe(true);
    const upd = state.prospectUpdates.find((u) => u.id === PROSPECT_ID);
    // tri "numeric/fr" : A2 avant A10
    expect(upd?.patch.booth_assignment).toBe('A2, A10');
  });

  it('refuse un bloc déjà assigné à un autre prospect', async () => {
    seedStand(B1, 'A1', { status: 'reserve', prospect_id: OTHER_PROSPECT_ID });
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/autre prospect/i);
  });

  it('refuse un bloc bloqué (hors-vente)', async () => {
    seedStand(B1, 'A1', { status: 'bloque' });
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bloqu/i);
  });

  it("refuse l'assignation à un prospect 'perdu'", async () => {
    state.prospects.set(PROSPECT_ID, {
      id: PROSPECT_ID,
      status: 'perdu',
      is_test: false,
      company_name: 'Acme',
    });
    seedStand(B1, 'A1');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    const r = await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/perdu/i);
  });

  it('RBAC : sales OK, viewer refusé', async () => {
    seedStand(B1, 'A1');
    state.profileRole = 'sales';
    mockEnv();
    let mod = await import('./multi-booth-actions');
    let r = await mod.setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1] });
    expect(r.ok).toBe(true);

    vi.resetModules();
    reset();
    state.prospects.set(PROSPECT_ID, {
      id: PROSPECT_ID,
      status: 'devis_envoye',
      is_test: false,
      company_name: 'Acme',
    });
    seedStand(B1, 'A1');
    state.profileRole = 'viewer';
    mockEnv();
    mod = await import('./multi-booth-actions');
    r = await mod.setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Forbidden');
  });

  it("audit_log 'prospect_booths_changed' avec assigned/unassigned/total_count", async () => {
    seedStand(B1, 'A1', { status: 'reserve', prospect_id: PROSPECT_ID });
    seedStand(B2, 'A2');
    mockEnv();
    const { setProspectBoothsAction } = await import('./multi-booth-actions');
    // replace : retire B1, ajoute B2.
    await setProspectBoothsAction({ prospect_id: PROSPECT_ID, booth_ids: [B2], mode: 'replace' });
    const audit = state.auditInserts.at(-1);
    const after = audit?.after as Record<string, unknown>;
    expect(after?.kind).toBe('prospect_booths_changed');
    expect(after?.total_count).toBe(1);
    expect(after?.assigned).toEqual([B2]);
    expect(after?.unassigned).toEqual([B1]);
  });
});

describe('searchProspectsForBoothAssign (P6.x.MultiBooths)', () => {
  beforeEach(() => {
    reset();
    state.prospects.set(PROSPECT_ID, {
      id: PROSPECT_ID,
      status: 'devis_envoye',
      is_test: false,
      company_name: 'Radio France',
    });
    state.prospects.set(OTHER_PROSPECT_ID, {
      id: OTHER_PROSPECT_ID,
      status: 'lead',
      is_test: false,
      company_name: 'TF1 Pub',
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('filtre par nom de société (case-insensitive)', async () => {
    mockEnv();
    const { searchProspectsForBoothAssign } = await import('./multi-booth-actions');
    const r = await searchProspectsForBoothAssign({ query: 'radio' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].company_name).toBe('Radio France');
    }
  });

  it('retourne vide si query < 2 caractères', async () => {
    mockEnv();
    const { searchProspectsForBoothAssign } = await import('./multi-booth-actions');
    const r = await searchProspectsForBoothAssign({ query: 'a' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(0);
  });
});
