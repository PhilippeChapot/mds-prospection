/**
 * @vitest-environment node
 *
 * P8.1 — tests du hook auto-enable a la signature.
 *
 * Couverts :
 *  1. Tous les contacts non-locked d'une company passent pref_exposant +
 *     pref_administration + pref_facturation = true a la signature.
 *  2. Contact avec exposant_locked_by_admin=true : pas touche a la pref
 *     locked (les autres non-locked sont quand meme MAJ).
 *  3. Contact unsubscribed : skip complet.
 *  4. Audit log cree avec kind='auto_enabled_on_signature'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  contacts: [] as Record<string, unknown>[],
  prefs: [] as Record<string, unknown>[],
  updates: [] as Array<{ table: string; filter: unknown; patch: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
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
    return [];
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    },
    maybeSingle: () =>
      Promise.resolve({ data: tableData().filter(matchRow)[0] ?? null, error: null }),
    insert: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = rowOrRows;
      if (Array.isArray(rowOrRows)) {
        for (const r of rowOrRows) state.inserts.push({ table, row: r });
        return Promise.resolve({ error: null });
      }
      if (table === 'audit_log' || table === 'contact_preferences') {
        state.inserts.push({ table, row: rowOrRows });
      }
      void pendingInsert;
      return Promise.resolve({ error: null });
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
    contact_id: contactId,
    pref_exposant: false,
    pref_administration: false,
    pref_facturation: false,
    exposant_locked_by_admin: false,
    administration_locked_by_admin: false,
    facturation_locked_by_admin: false,
    unsubscribed_all_at: null,
    ...override,
  };
}

describe('autoEnableExpoPreferencesOnSignature (P8.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.contacts = [];
    state.prefs = [];
    state.updates = [];
    state.inserts = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('1) tous les contacts non-locked passent les 3 prefs a true', async () => {
    state.contacts = [
      { id: 'c1', email: 'a@x.fr', company_id: 'co' },
      { id: 'c2', email: 'b@x.fr', company_id: 'co' },
    ];
    state.prefs = [makePrefRow('c1'), makePrefRow('c2')];
    mockEnv();
    const { autoEnableExpoPreferencesOnSignature } = await import('./auto-enable');
    const r = await autoEnableExpoPreferencesOnSignature({
      prospectId: 'p1',
      companyId: 'co',
    });
    expect(r.contacts_updated).toBe(2);
    expect(r.contacts_skipped_locked).toBe(0);
    // 2 updates dans contact_preferences (1 par contact)
    const prefsUpdates = state.updates.filter((u) => u.table === 'contact_preferences');
    expect(prefsUpdates).toHaveLength(2);
    for (const u of prefsUpdates) {
      const patch = u.patch as Record<string, unknown>;
      expect(patch.pref_exposant).toBe(true);
      expect(patch.pref_administration).toBe(true);
      expect(patch.pref_facturation).toBe(true);
    }
  });

  it('2) contact avec exposant_locked=true : pas de patch pref_exposant (autres MAJ)', async () => {
    state.contacts = [{ id: 'c1', email: 'a@x.fr', company_id: 'co' }];
    state.prefs = [makePrefRow('c1', { exposant_locked_by_admin: true })];
    mockEnv();
    const { autoEnableExpoPreferencesOnSignature } = await import('./auto-enable');
    const r = await autoEnableExpoPreferencesOnSignature({
      prospectId: 'p1',
      companyId: 'co',
    });
    expect(r.contacts_updated).toBe(1);
    const patch = state.updates[0].patch as Record<string, unknown>;
    expect(patch).not.toHaveProperty('pref_exposant'); // locked → omis du patch
    expect(patch.pref_administration).toBe(true);
    expect(patch.pref_facturation).toBe(true);
  });

  it('3) contact unsubscribed : skip complet, pas de update', async () => {
    state.contacts = [{ id: 'c1', email: 'a@x.fr', company_id: 'co' }];
    state.prefs = [makePrefRow('c1', { unsubscribed_all_at: '2026-01-01T00:00:00Z' })];
    mockEnv();
    const { autoEnableExpoPreferencesOnSignature } = await import('./auto-enable');
    const r = await autoEnableExpoPreferencesOnSignature({
      prospectId: 'p1',
      companyId: 'co',
    });
    expect(r.contacts_updated).toBe(0);
    expect(r.contacts_skipped_locked).toBe(1);
    expect(state.updates.filter((u) => u.table === 'contact_preferences')).toHaveLength(0);
  });

  it("4) audit log cree avec kind='auto_enabled_on_signature'", async () => {
    state.contacts = [{ id: 'c1', email: 'a@x.fr', company_id: 'co' }];
    state.prefs = [makePrefRow('c1')];
    mockEnv();
    const { autoEnableExpoPreferencesOnSignature } = await import('./auto-enable');
    await autoEnableExpoPreferencesOnSignature({ prospectId: 'p1', companyId: 'co' });
    const audit = state.inserts.find((i) => i.table === 'audit_log');
    expect(audit).toBeDefined();
    const after = audit?.row.after as Record<string, unknown>;
    expect(after.kind).toBe('auto_enabled_on_signature');
    expect(after.prospect_id).toBe('p1');
    expect(after.actor_role).toBe('system');
  });

  it('5) tous les 3 prefs locked + contact non-unsubscribed -> skip complet', async () => {
    state.contacts = [{ id: 'c1', email: 'a@x.fr', company_id: 'co' }];
    state.prefs = [
      makePrefRow('c1', {
        exposant_locked_by_admin: true,
        administration_locked_by_admin: true,
        facturation_locked_by_admin: true,
      }),
    ];
    mockEnv();
    const { autoEnableExpoPreferencesOnSignature } = await import('./auto-enable');
    const r = await autoEnableExpoPreferencesOnSignature({
      prospectId: 'p1',
      companyId: 'co',
    });
    expect(r.contacts_updated).toBe(0);
    expect(r.contacts_skipped_locked).toBe(1);
    expect(state.updates.filter((u) => u.table === 'contact_preferences')).toHaveLength(0);
  });
});
