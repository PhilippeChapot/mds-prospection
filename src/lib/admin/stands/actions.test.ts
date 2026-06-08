/**
 * @vitest-environment node
 *
 * P6.x.2a — tests server actions stands.
 *
 * Couvre :
 *   - assignStandToProspectAction :
 *       * Forbidden si role viewer
 *       * stand déjà réservé → refus
 *       * stand bloqué → refus
 *       * happy path prospect status='devis_envoye' → stand status='reserve'
 *       * prospect status='acompte_paye' → stand status='paye'
 *       * prospect a déjà un autre stand → soft-réassign (libère ancien)
 *       * prospect perdu → refus
 *   - removeStandFromProspectAction : reset prospect_id + status='libre'
 *   - syncStandStatusFromProspect : libère le stand si prospect perdu
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PROSPECT_ID = '92d51b10-7085-4695-b257-72c61d01917a';
const STAND_ID = 'b0b51b10-7085-4695-b257-72c61d01917a';
const OTHER_STAND_ID = 'c1c51b10-7085-4695-b257-72c61d01917a';

interface StandRow {
  id: string;
  number: string;
  salle: string;
  status: 'libre' | 'reserve' | 'paye' | 'bloque';
  prospect_id: string | null;
}

interface MockState {
  profileRole: 'admin' | 'sales' | 'viewer';
  prospects: Map<string, { id: string; status: string }>;
  stands: Map<string, StandRow>;
  standUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  prospectUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
}

const state: MockState = {
  profileRole: 'admin',
  prospects: new Map(),
  stands: new Map(),
  standUpdates: [],
  prospectUpdates: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'u', role: state.profileRole, email: 'a@b' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'stands') {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: () => {
                  if (col === 'id') {
                    const row = state.stands.get(val);
                    return Promise.resolve({ data: row ?? null, error: null });
                  }
                  if (col === 'prospect_id') {
                    const row = Array.from(state.stands.values()).find(
                      (s) => s.prospect_id === val,
                    );
                    return Promise.resolve({ data: row ?? null, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
                neq: (_col2: string, otherId: string) => ({
                  maybeSingle: () => {
                    const row = Array.from(state.stands.values()).find(
                      (s) => s.prospect_id === val && s.id !== otherId,
                    );
                    return Promise.resolve({ data: row ?? null, error: null });
                  },
                }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
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
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: state.prospects.get(val) ?? null, error: null }),
              }),
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
          // P14.4 : assignStandToProspectAction logge un audit_log fire-and-forget
          // (timeline drawer auto-entry). Mock no-op, on n a pas besoin de
          // vérifier le contenu dans les tests stands.
          return {
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {};
      },
    }),
  }));

  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
}

function resetState() {
  state.profileRole = 'admin';
  state.prospects.clear();
  state.stands.clear();
  state.standUpdates.length = 0;
  state.prospectUpdates.length = 0;
}

describe('assignStandToProspectAction (P6.x.2a)', () => {
  beforeEach(() => {
    resetState();
    state.prospects.set(PROSPECT_ID, { id: PROSPECT_ID, status: 'devis_envoye' });
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'L01',
      salle: 'le_notre',
      status: 'libre',
      prospect_id: null,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse role=viewer', async () => {
    state.profileRole = 'viewer';
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(false);
  });

  it("happy path prospect status='devis_envoye' → stand status='reserve' + booth_assignment sync", async () => {
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(true);
    // Stand update
    const standUpd = state.standUpdates.find((u) => u.id === STAND_ID);
    expect(standUpd?.patch.prospect_id).toBe(PROSPECT_ID);
    expect(standUpd?.patch.status).toBe('reserve');
    // Prospect sync (booth_assignment = stand.number)
    const prospUpd = state.prospectUpdates.find((u) => u.id === PROSPECT_ID);
    expect(prospUpd?.patch.booth_assignment).toBe('L01');
    expect(prospUpd?.patch.booth_assigned_at).toBeDefined();
  });

  it("prospect status='acompte_paye' → stand status='paye'", async () => {
    state.prospects.set(PROSPECT_ID, { id: PROSPECT_ID, status: 'acompte_paye' });
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(true);
    expect(state.standUpdates.find((u) => u.id === STAND_ID)?.patch.status).toBe('paye');
  });

  it("stand bloqué → refus 'hors-vente'", async () => {
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'L01',
      salle: 'le_notre',
      status: 'bloque',
      prospect_id: null,
    });
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bloqué/i);
  });

  it('stand déjà assigné à un autre prospect → refus', async () => {
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'L01',
      salle: 'le_notre',
      status: 'reserve',
      prospect_id: 'someone-else',
    });
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/déjà assigné/i);
  });

  it('soft-réassignation : prospect déjà sur OTHER_STAND → libère ancien + assigne nouveau', async () => {
    state.stands.set(OTHER_STAND_ID, {
      id: OTHER_STAND_ID,
      number: 'L05',
      salle: 'le_notre',
      status: 'reserve',
      prospect_id: PROSPECT_ID,
    });
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.previous_stand_id).toBe(OTHER_STAND_ID);
    // L'ancien stand a été libéré
    const oldUpd = state.standUpdates.find((u) => u.id === OTHER_STAND_ID);
    expect(oldUpd?.patch.prospect_id).toBe(null);
    expect(oldUpd?.patch.status).toBe('libre');
  });

  it("prospect status='perdu' → refus 'réactivez d'abord'", async () => {
    state.prospects.set(PROSPECT_ID, { id: PROSPECT_ID, status: 'perdu' });
    mockEnv();
    const { assignStandToProspectAction } = await import('./actions');
    const r = await assignStandToProspectAction({ stand_id: STAND_ID, prospect_id: PROSPECT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/perdu/i);
  });
});

describe('removeStandFromProspectAction (P6.x.2a)', () => {
  beforeEach(() => {
    resetState();
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'L01',
      salle: 'le_notre',
      status: 'reserve',
      prospect_id: PROSPECT_ID,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('libère le stand + reset prospect.booth_assignment', async () => {
    mockEnv();
    const { removeStandFromProspectAction } = await import('./actions');
    const r = await removeStandFromProspectAction({ stand_id: STAND_ID });
    expect(r.ok).toBe(true);
    const standUpd = state.standUpdates.find((u) => u.id === STAND_ID);
    expect(standUpd?.patch.prospect_id).toBe(null);
    expect(standUpd?.patch.status).toBe('libre');
    const prospUpd = state.prospectUpdates.find((u) => u.id === PROSPECT_ID);
    expect(prospUpd?.patch.booth_assignment).toBe(null);
  });
});

describe('syncStandStatusFromProspect (P6.x.2a)', () => {
  beforeEach(() => {
    resetState();
    state.prospects.set(PROSPECT_ID, { id: PROSPECT_ID, status: 'acompte_paye' });
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'L01',
      salle: 'le_notre',
      status: 'reserve',
      prospect_id: PROSPECT_ID,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("met à jour le stand 'reserve' → 'paye' quand prospect passe 'acompte_paye'", async () => {
    mockEnv();
    const { syncStandStatusFromProspect } = await import('./actions');
    await syncStandStatusFromProspect(PROSPECT_ID);
    const standUpd = state.standUpdates.find((u) => u.id === STAND_ID);
    expect(standUpd?.patch.status).toBe('paye');
  });

  it("libère le stand quand prospect passe 'perdu'", async () => {
    state.prospects.set(PROSPECT_ID, { id: PROSPECT_ID, status: 'perdu' });
    mockEnv();
    const { syncStandStatusFromProspect } = await import('./actions');
    await syncStandStatusFromProspect(PROSPECT_ID);
    const standUpd = state.standUpdates.find((u) => u.id === STAND_ID);
    expect(standUpd?.patch.prospect_id).toBe(null);
    expect(standUpd?.patch.status).toBe('libre');
    // Prospect aussi reset
    const prospUpd = state.prospectUpdates.find((u) => u.id === PROSPECT_ID);
    expect(prospUpd?.patch.booth_assignment).toBe(null);
  });
});

describe('updateStandPositionAction (P6.x.3)', () => {
  beforeEach(() => {
    resetState();
    state.stands.set(STAND_ID, {
      id: STAND_ID,
      number: 'A1',
      salle: 'le_notre',
      status: 'libre',
      prospect_id: null,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('admin happy path : 0-100 → persiste position_x/y/w/h en DB', async () => {
    mockEnv();
    const { updateStandPositionAction } = await import('./actions');
    const r = await updateStandPositionAction({
      stand_id: STAND_ID,
      position_x: 22.5,
      position_y: 12,
      position_w: 6.8,
      position_h: 8.5,
    });
    expect(r.ok).toBe(true);
    const upd = state.standUpdates.find((u) => u.id === STAND_ID);
    expect(upd?.patch.position_x).toBe(22.5);
    expect(upd?.patch.position_y).toBe(12);
    expect(upd?.patch.position_w).toBe(6.8);
    expect(upd?.patch.position_h).toBe(8.5);
  });

  it('Zod : refuse une valeur hors bornes (x=150 > 100)', async () => {
    mockEnv();
    const { updateStandPositionAction } = await import('./actions');
    const r = await updateStandPositionAction({
      stand_id: STAND_ID,
      position_x: 150,
      position_y: 10,
      position_w: 5,
      position_h: 5,
    });
    expect(r.ok).toBe(false);
    // Aucune update DB n'a été tentée
    expect(state.standUpdates.find((u) => u.id === STAND_ID)).toBeUndefined();
  });

  it('refuse role=sales (admin only — calibration sensible)', async () => {
    state.profileRole = 'sales';
    mockEnv();
    const { updateStandPositionAction } = await import('./actions');
    const r = await updateStandPositionAction({
      stand_id: STAND_ID,
      position_x: 10,
      position_y: 10,
      position_w: 5,
      position_h: 5,
    });
    expect(r.ok).toBe(false);
    expect(state.standUpdates).toHaveLength(0);
  });
});
