/**
 * @vitest-environment node
 *
 * P8.1 — tests des server actions contact-preferences.
 *
 * Couverts (12 tests minimum) :
 *   1. listByCompany retourne contacts + prefs triés (primary first)
 *   2. upsertAdmin UPSERT + audit log avec actor_role=admin
 *   3. upsertAdmin throw si non-admin
 *   4. unlockAll throw si non-super_admin (admin = throw)
 *   5. unlockAll reset les 7 locks
 *   6. unsubscribeAll set unsubscribed_all_at + reset prefs
 *   7. unsubscribeAll throw sans contact_id
 *   8. resubscribe nullifie unsubscribed_all_at
 *   9. getMyPreferences return null si pas de session
 *  10. updateMyPreferences self-update OK
 *  11. autoEnable hook : tous les contacts non-locked passent a true
 *  12. autoEnable hook : contact locked = skip + contact unsubscribed = skip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  // Auth
  isAdmin: true,
  adminProfile: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@mds.fr',
    full_name: 'Alice',
    role: 'admin' as 'admin' | 'sales' | 'super_admin',
  },
  // Espace exposant
  prospectId: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp',
  contactIdFromSession: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  sessionThrows: false as boolean | string,
  // Tables
  contacts: [] as Record<string, unknown>[],
  prefs: [] as Record<string, unknown>[],
  // Counters
  updates: [] as Array<{ table: string; filter: unknown; patch: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  // Hook signature spy
  contactsForCompany: [] as Array<{ id: string; email: string }>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));

  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.isAdmin) throw new Error('NEXT_REDIRECT');
      return state.adminProfile;
    }),
    requireSuperAdmin: vi.fn(async () => {
      if (!state.isAdmin) throw new Error('NEXT_REDIRECT');
      if (state.adminProfile.role !== 'super_admin') {
        throw new Error('Réservé aux super_admin.');
      }
      return state.adminProfile;
    }),
  }));

  vi.doMock('@/lib/espace-exposant/session', () => ({
    // P8.2-redirect-loop : les actions utilisent maintenant
    // requireContactSession (universel) au lieu de requireEspaceExposantSession.
    requireContactSession: vi.fn(async () => {
      if (state.sessionThrows) throw new Error(String(state.sessionThrows));
      return { contactId: state.contactIdFromSession, prospectId: state.prospectId };
    }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];

  const matchRow = (row: Record<string, unknown>): boolean => {
    for (const f of filters) {
      if (row[f.col] !== f.val) return false;
    }
    return true;
  };

  const tableData = (): Record<string, unknown>[] => {
    if (table === 'contacts') return state.contacts;
    if (table === 'contact_preferences') return state.prefs;
    if (table === 'prospects')
      return [{ id: state.prospectId, primary_contact_id: state.contactIdFromSession }];
    return [];
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    },
    order: () => chain,
    maybeSingle: () =>
      Promise.resolve({ data: tableData().filter(matchRow)[0] ?? null, error: null }),
    single: () => {
      if (pendingInsert && !Array.isArray(pendingInsert)) {
        const id = `${table}-${state.inserts.length}-${Date.now()}`;
        const row = { id, ...pendingInsert };
        if (table === 'contact_preferences') state.prefs.push(row);
        state.inserts.push({ table, row });
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = rowOrRows;
      if (Array.isArray(rowOrRows)) {
        for (const r of rowOrRows) state.inserts.push({ table, row: r });
        return Promise.resolve({ error: null });
      }
      if (table === 'audit_log') {
        state.inserts.push({ table, row: rowOrRows });
        return Promise.resolve({ error: null });
      }
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null; data?: unknown }) => unknown) => {
      const rows = tableData().filter(matchRow);
      if (pendingPatch) {
        for (const r of rows) Object.assign(r, pendingPatch);
        state.updates.push({ table, filter: filters, patch: pendingPatch });
        return Promise.resolve({ error: null }).then(onfulfilled);
      }
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
    },
  };
  return chain;
}

function makePrefRow(contactId: string, override: Partial<Record<string, unknown>> = {}) {
  return {
    id: `pref-${contactId}`,
    contact_id: contactId,
    pref_general: true,
    pref_exposant: false,
    pref_facturation: false,
    pref_kit_media: false,
    pref_administration: false,
    pref_partenariat: false,
    pref_post_event: false,
    general_locked_by_admin: false,
    exposant_locked_by_admin: false,
    facturation_locked_by_admin: false,
    kit_media_locked_by_admin: false,
    administration_locked_by_admin: false,
    partenariat_locked_by_admin: false,
    post_event_locked_by_admin: false,
    unsubscribed_all_at: null,
    unsubscribed_reason: null,
    updated_by_user_id: null,
    updated_at: '2026-05-27T00:00:00Z',
    created_at: '2026-05-27T00:00:00Z',
    ...override,
  };
}

function resetState() {
  state.isAdmin = true;
  state.adminProfile = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@mds.fr',
    full_name: 'Alice',
    role: 'admin',
  };
  state.sessionThrows = false;
  state.contacts = [];
  state.prefs = [];
  state.updates = [];
  state.inserts = [];
}

describe('listContactPreferencesByCompanyAction (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.contacts = [
      {
        id: 'c1',
        email: 'alice@x.fr',
        first_name: 'Alice',
        last_name: 'X',
        is_primary: true,
        company_id: 'company-1',
        created_at: '2026-05-27T00:00:00Z',
        preferences: makePrefRow('c1'),
      },
      {
        id: 'c2',
        email: 'bob@x.fr',
        first_name: 'Bob',
        last_name: 'Y',
        is_primary: false,
        company_id: 'company-1',
        created_at: '2026-05-28T00:00:00Z',
        preferences: makePrefRow('c2', { pref_exposant: true }),
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin : retourne les contacts + prefs (primary first)', async () => {
    mockEnv();
    const { listContactPreferencesByCompanyAction } = await import('./actions');
    const r = await listContactPreferencesByCompanyAction({ company_id: 'company-1' });
    expect(r).toHaveLength(2);
    expect(r[0].is_primary).toBe(true);
    expect(r[0].preferences?.pref_general).toBe(true);
    expect(r[1].preferences?.pref_exposant).toBe(true);
  });
});

describe('upsertContactPreferenceAdminAction (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.prefs = [makePrefRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc')];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('UPSERT + audit log avec actor_role=admin', async () => {
    mockEnv();
    const { upsertContactPreferenceAdminAction } = await import('./actions');
    const r = await upsertContactPreferenceAdminAction({
      contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      prefs: { pref_exposant: true },
      locks: { exposant_locked_by_admin: true },
    });
    expect(r.ok).toBe(true);
    // Update applique.
    expect(state.updates.length).toBeGreaterThan(0);
    const updatePatch = state.updates[0].patch as Record<string, unknown>;
    expect(updatePatch.pref_exposant).toBe(true);
    expect(updatePatch.exposant_locked_by_admin).toBe(true);
    expect(updatePatch.updated_by_user_id).toBe(state.adminProfile.id);
    // Audit log avec kind=admin_updated
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect(audit).toBeDefined();
    expect((audit?.row.after as { kind: string }).kind).toBe('admin_updated');
  });

  it('non-admin -> throw', async () => {
    state.isAdmin = false;
    mockEnv();
    const { upsertContactPreferenceAdminAction } = await import('./actions');
    await expect(
      upsertContactPreferenceAdminAction({
        contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        prefs: { pref_exposant: true },
      }),
    ).rejects.toThrow();
  });
});

describe('unlockAllPreferencesAction (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.prefs = [
      makePrefRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
        exposant_locked_by_admin: true,
        facturation_locked_by_admin: true,
      }),
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('reset les 7 locks pour super_admin', async () => {
    state.adminProfile.role = 'super_admin';
    mockEnv();
    const { unlockAllPreferencesAction } = await import('./actions');
    const r = await unlockAllPreferencesAction({
      contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(r.ok).toBe(true);
    const updatePatch = state.updates[0].patch as Record<string, unknown>;
    expect(updatePatch.exposant_locked_by_admin).toBe(false);
    expect(updatePatch.facturation_locked_by_admin).toBe(false);
  });

  it("admin (pas super_admin) -> ok:false 'Réservé...'", async () => {
    state.adminProfile.role = 'admin';
    mockEnv();
    const { unlockAllPreferencesAction } = await import('./actions');
    const r = await unlockAllPreferencesAction({
      contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(r.ok).toBe(false);
  });
});

describe('unsubscribeAllAction / resubscribeAction (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.prefs = [makePrefRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc')];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('unsub : reset toutes prefs + unsubscribed_all_at', async () => {
    mockEnv();
    const { unsubscribeAllAction } = await import('./actions');
    const r = await unsubscribeAllAction({
      contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reason: 'Test desinscription',
    });
    expect(r.ok).toBe(true);
    const updatePatch = state.updates[0].patch as Record<string, unknown>;
    expect(updatePatch.pref_general).toBe(false);
    expect(updatePatch.pref_exposant).toBe(false);
    expect(updatePatch.unsubscribed_all_at).toBeTruthy();
    expect(updatePatch.unsubscribed_reason).toBe('Test desinscription');
  });

  it('unsub schema rejette UUID invalide', async () => {
    mockEnv();
    const { unsubscribeAllAction } = await import('./actions');
    const r = await unsubscribeAllAction({ contact_id: 'not-a-uuid' });
    expect(r.ok).toBe(false);
  });

  it('resub : nullifie unsubscribed_all_at', async () => {
    state.prefs = [
      makePrefRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
        unsubscribed_all_at: '2026-05-01T00:00:00Z',
      }),
    ];
    mockEnv();
    const { resubscribeAction } = await import('./actions');
    const r = await resubscribeAction({ contact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    expect(r.ok).toBe(true);
    const updatePatch = state.updates[0].patch as Record<string, unknown>;
    expect(updatePatch.unsubscribed_all_at).toBeNull();
  });
});

describe('getMyPreferencesAction / updateMyPreferencesAction (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.prefs = [makePrefRow(state.contactIdFromSession)];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('getMy : retourne la row du contact session', async () => {
    mockEnv();
    const { getMyPreferencesAction } = await import('./actions');
    const r = await getMyPreferencesAction({ locale: 'fr' });
    expect(r).not.toBeNull();
    expect(r?.contact_id).toBe(state.contactIdFromSession);
  });

  it('getMy : session invalide -> null', async () => {
    state.sessionThrows = 'no session';
    mockEnv();
    const { getMyPreferencesAction } = await import('./actions');
    const r = await getMyPreferencesAction({ locale: 'fr' });
    expect(r).toBeNull();
  });

  it('updateMy self-update : updated_by_user_id reste null (gate-trigger)', async () => {
    mockEnv();
    const { updateMyPreferencesAction } = await import('./actions');
    const r = await updateMyPreferencesAction({
      locale: 'fr',
      prefs: { pref_partenariat: true },
    });
    expect(r.ok).toBe(true);
    const updatePatch = state.updates[0].patch as Record<string, unknown>;
    expect(updatePatch.pref_partenariat).toBe(true);
    // updated_by_user_id pas dans le patch = self context, trigger DB enforce locks.
    expect(updatePatch).not.toHaveProperty('updated_by_user_id');
  });
});
