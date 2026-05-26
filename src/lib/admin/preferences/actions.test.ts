/**
 * @vitest-environment node
 *
 * P2.x.1 — tests server actions app_settings.
 *
 * Couvre :
 *   - upsertSettingAction : create + update + audit log + validation registry
 *   - deleteSettingAction : super_admin requis + audit log + reason
 *   - getSettingByKeyAction : read admin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SettingStub {
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  updated_at: string;
  updated_by_user_id: string | null;
}

const state = {
  adminRole: 'admin' as 'admin' | 'sales' | 'super_admin' | null,
  rows: [] as SettingStub[],
  audit: [] as Array<{ table: string; row: Record<string, unknown> }>,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.adminRole) throw new Error('redirect');
      return { id: 'u-admin', email: 'a@b', full_name: null, role: state.adminRole };
    }),
    requireSuperAdmin: vi.fn(async () => {
      if (state.adminRole !== 'super_admin') {
        throw new Error('Réservé aux super_admin.');
      }
      return { id: 'u-super', email: 's@b', full_name: null, role: 'super_admin' as const };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return {
    from: (table: string) => {
      if (table === 'app_settings') return makeSettingsChain();
      if (table === 'audit_log') return makeAuditChain();
      return makeSettingsChain();
    },
  };
}

function makeSettingsChain() {
  let filterKey: string | null = null;
  let isDelete = false;
  let pendingUpsert: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    eq: (col: string, val: unknown) => {
      if (col === 'key') filterKey = val as string;
      return chain;
    },
    maybeSingle: () => {
      const row = state.rows.find((r) => r.key === filterKey) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    upsert: (row: Record<string, unknown>) => {
      pendingUpsert = row;
      return Promise.resolve({ error: null }).then(() => {
        if (!pendingUpsert) return { error: null };
        const idx = state.rows.findIndex((r) => r.key === pendingUpsert!.key);
        const next = {
          key: pendingUpsert.key as string,
          value: pendingUpsert.value,
          description: (pendingUpsert.description as string) ?? null,
          category: pendingUpsert.category as string,
          updated_at: (pendingUpsert.updated_at as string) ?? new Date().toISOString(),
          updated_by_user_id: (pendingUpsert.updated_by_user_id as string) ?? null,
        };
        if (idx >= 0) state.rows[idx] = next;
        else state.rows.push(next);
        return { error: null };
      });
    },
    delete: () => {
      isDelete = true;
      return chain;
    },
    then: (onfulfilled: (v: { error: null }) => unknown) => {
      if (isDelete && filterKey) {
        state.rows = state.rows.filter((r) => r.key !== filterKey);
      }
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

function makeAuditChain() {
  return {
    insert: (row: Record<string, unknown>) => {
      state.audit.push({ table: 'audit_log', row });
      return Promise.resolve({ error: null });
    },
  };
}

describe('upsertSettingAction (P2.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('create : insert + audit log create', async () => {
    mockEnv();
    const { upsertSettingAction } = await import('./actions');
    const r = await upsertSettingAction({
      key: 'acompte_percent',
      value: 30,
      category: 'finance',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].value).toBe(30);
    expect(state.audit[0].row.action).toBe('create');
    expect(state.audit[0].row.entity_type).toBe('app_settings');
  });

  it('update : preserve description ancienne si non fournie', async () => {
    mockEnv();
    state.rows = [
      {
        key: 'acompte_percent',
        value: 25,
        description: 'Ancien commentaire',
        category: 'finance',
        updated_at: '2026-05-20T00:00:00Z',
        updated_by_user_id: null,
      },
    ];
    const { upsertSettingAction } = await import('./actions');
    const r = await upsertSettingAction({
      key: 'acompte_percent',
      value: 35,
      category: 'finance',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(false);
    expect(state.rows[0].value).toBe(35);
    expect(state.rows[0].description).toBe('Ancien commentaire');
    expect(state.audit[0].row.action).toBe('update');
  });

  it('rejette une value invalide selon le registry (acompte_percent > 100)', async () => {
    mockEnv();
    const { upsertSettingAction } = await import('./actions');
    const r = await upsertSettingAction({
      key: 'acompte_percent',
      value: 150,
      category: 'finance',
    });
    expect(r.ok).toBe(false);
    expect(state.rows).toHaveLength(0);
  });

  it('accepte JSON libre pour une key custom (inconnue du registry)', async () => {
    mockEnv();
    const { upsertSettingAction } = await import('./actions');
    const r = await upsertSettingAction({
      key: 'my_custom_thing',
      value: { foo: 'bar', n: 42 },
      category: 'general',
    });
    expect(r.ok).toBe(true);
    expect(state.rows[0].value).toEqual({ foo: 'bar', n: 42 });
  });

  it('rejette si role = null (redirect throw)', async () => {
    mockEnv();
    state.adminRole = null;
    const { upsertSettingAction } = await import('./actions');
    await expect(
      upsertSettingAction({ key: 'acompte_percent', value: 30, category: 'finance' }),
    ).rejects.toThrow('redirect');
  });
});

describe('deleteSettingAction (P2.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('role=admin -> 403 (super_admin only)', async () => {
    mockEnv();
    state.adminRole = 'admin';
    const { deleteSettingAction } = await import('./actions');
    const r = await deleteSettingAction({ key: 'acompte_percent', reason: 'Test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/);
  });

  it('role=super_admin + key existante -> delete + audit log strict', async () => {
    mockEnv();
    state.adminRole = 'super_admin';
    state.rows = [
      {
        key: 'acompte_percent',
        value: 30,
        description: 'À supprimer',
        category: 'finance',
        updated_at: '2026-05-20T00:00:00Z',
        updated_by_user_id: null,
      },
    ];
    const { deleteSettingAction } = await import('./actions');
    const r = await deleteSettingAction({
      key: 'acompte_percent',
      reason: 'Migration vers autre nom',
    });
    expect(r.ok).toBe(true);
    expect(state.rows).toHaveLength(0);
    expect(state.audit[0].row.action).toBe('delete');
    expect((state.audit[0].row.before as { value: number }).value).toBe(30);
    expect((state.audit[0].row.after as { reason: string }).reason).toBe(
      'Migration vers autre nom',
    );
  });

  it('reason trop court (< 3 chars) -> ok:false validation Zod', async () => {
    mockEnv();
    state.adminRole = 'super_admin';
    state.rows = [
      {
        key: 'acompte_percent',
        value: 30,
        description: null,
        category: 'finance',
        updated_at: new Date().toISOString(),
        updated_by_user_id: null,
      },
    ];
    const { deleteSettingAction } = await import('./actions');
    const r = await deleteSettingAction({ key: 'acompte_percent', reason: 'ok' });
    expect(r.ok).toBe(false);
  });

  it('key introuvable -> ok:false', async () => {
    mockEnv();
    state.adminRole = 'super_admin';
    const { deleteSettingAction } = await import('./actions');
    const r = await deleteSettingAction({
      key: 'inexistant_key',
      reason: 'Test reason',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/introuvable/);
  });
});

describe('getSettingByKeyAction (P2.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin -> retourne row + enrichi label/type', async () => {
    mockEnv();
    state.rows = [
      {
        key: 'acompte_percent',
        value: 30,
        description: 'desc',
        category: 'finance',
        updated_at: new Date().toISOString(),
        updated_by_user_id: null,
      },
    ];
    const { getSettingByKeyAction } = await import('./actions');
    const r = await getSettingByKeyAction({ key: 'acompte_percent' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.value).toBe(30);
      expect(r.data.is_known).toBe(true);
      expect(r.data.type).toBe('percent');
    }
  });
});
