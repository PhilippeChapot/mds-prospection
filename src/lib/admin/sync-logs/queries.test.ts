/**
 * @vitest-environment node
 *
 * P4.x.1 — tests queries sync_logs (list + KPIs + detail).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SyncLogStub {
  id: string;
  entity_type: string;
  entity_id: string;
  target: 'sellsy' | 'brevo' | 'connectonair' | 'stripe';
  operation: 'create' | 'update' | 'pull' | 'check';
  status: 'success' | 'pending' | 'error';
  error_message: string | null;
  payload: unknown;
  created_at: string;
}

const state: { rows: SyncLogStub[]; lastFilters: Record<string, unknown> } = {
  rows: [],
  lastFilters: {},
};

function mockEnv() {
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
      from: () => makeChain(),
    }),
  }));
}

function makeChain() {
  // Capture les filtres pour assertion ; renvoie un subset des rows
  // selon les filtres appliqués. Le builder est *thenable* (comme
  // Postgrest) : tous les `.method()` retournent `chain`, l'awaiter
  // déclenche `.then()` qui calcule le résultat.
  let filtered = [...state.rows];
  let offset = 0;
  let limit = 50;
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    range: (a: number, b: number) => {
      offset = a;
      limit = b - a + 1;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      state.lastFilters[col] = val;
      filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
      return chain;
    },
    gte: (col: string, val: string) => {
      state.lastFilters[`gte_${col}`] = val;
      filtered = filtered.filter((r) => (r as unknown as Record<string, string>)[col] >= val);
      return chain;
    },
    lte: (col: string, val: string) => {
      filtered = filtered.filter((r) => (r as unknown as Record<string, string>)[col] <= val);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    then: (onfulfilled: (v: { data: unknown; count: number; error: null }) => unknown) => {
      const sliced = filtered.slice(offset, offset + limit);
      return Promise.resolve({ data: sliced, count: filtered.length, error: null }).then(
        onfulfilled,
      );
    },
  };
  return chain;
}

function makeLog(o: Partial<SyncLogStub> & { id: string }): SyncLogStub {
  return {
    id: o.id,
    entity_type: o.entity_type ?? 'prospects',
    entity_id: o.entity_id ?? '11111111-1111-4111-8111-111111111111',
    target: o.target ?? 'sellsy',
    operation: o.operation ?? 'create',
    status: o.status ?? 'success',
    error_message: o.error_message ?? null,
    payload: o.payload ?? null,
    created_at: o.created_at ?? new Date().toISOString(),
  };
}

describe('listSyncLogs (P4.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.rows = [];
    state.lastFilters = {};
  });
  afterEach(() => vi.restoreAllMocks());

  it('retourne les rows paginées avec total', async () => {
    state.rows = [
      makeLog({ id: '1', target: 'sellsy', status: 'success' }),
      makeLog({ id: '2', target: 'brevo', status: 'error' }),
    ];
    mockEnv();
    const { listSyncLogs } = await import('./queries');
    const r = await listSyncLogs({ page: 1, page_size: 50 });
    expect(r.rows).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it('filtre par target=brevo', async () => {
    state.rows = [makeLog({ id: '1', target: 'sellsy' }), makeLog({ id: '2', target: 'brevo' })];
    mockEnv();
    const { listSyncLogs } = await import('./queries');
    const r = await listSyncLogs({ page: 1, page_size: 50, target: 'brevo' });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].target).toBe('brevo');
  });

  it('filtre par status=error', async () => {
    state.rows = [
      makeLog({ id: '1', status: 'success' }),
      makeLog({ id: '2', status: 'error' }),
      makeLog({ id: '3', status: 'error' }),
    ];
    mockEnv();
    const { listSyncLogs } = await import('./queries');
    const r = await listSyncLogs({ page: 1, page_size: 50, status: 'error' });
    expect(r.rows).toHaveLength(2);
  });

  it('filtre par date range (from / to)', async () => {
    state.rows = [
      makeLog({ id: '1', created_at: '2026-05-20T10:00:00Z' }),
      makeLog({ id: '2', created_at: '2026-05-25T10:00:00Z' }),
      makeLog({ id: '3', created_at: '2026-05-30T10:00:00Z' }),
    ];
    mockEnv();
    const { listSyncLogs } = await import('./queries');
    const r = await listSyncLogs({
      page: 1,
      page_size: 50,
      from: '2026-05-22T00:00:00Z',
      to: '2026-05-28T00:00:00Z',
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe('2');
  });
});

describe('getSyncLogsKpis (P4.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.rows = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('calcule total + errors + error_rate sur 7j', async () => {
    state.rows = [
      makeLog({ id: '1', status: 'success', target: 'sellsy' }),
      makeLog({ id: '2', status: 'success', target: 'sellsy' }),
      makeLog({ id: '3', status: 'error', target: 'sellsy' }),
      makeLog({ id: '4', status: 'error', target: 'brevo' }),
    ];
    mockEnv();
    const { getSyncLogsKpis } = await import('./queries');
    const k = await getSyncLogsKpis();
    expect(k.total_7d).toBe(4);
    expect(k.errors_7d).toBe(2);
    expect(k.error_rate_7d).toBe(50);
  });

  it('top_target_in_error = target avec le plus d’erreurs', async () => {
    state.rows = [
      makeLog({ id: '1', status: 'error', target: 'sellsy' }),
      makeLog({ id: '2', status: 'error', target: 'sellsy' }),
      makeLog({ id: '3', status: 'error', target: 'brevo' }),
    ];
    mockEnv();
    const { getSyncLogsKpis } = await import('./queries');
    const k = await getSyncLogsKpis();
    expect(k.top_target_in_error).toBe('sellsy');
  });

  it('0 erreur -> top_target_in_error=null', async () => {
    state.rows = [makeLog({ id: '1', status: 'success' })];
    mockEnv();
    const { getSyncLogsKpis } = await import('./queries');
    const k = await getSyncLogsKpis();
    expect(k.top_target_in_error).toBeNull();
    expect(k.error_rate_7d).toBe(0);
  });

  it('0 row -> tous les KPIs à 0', async () => {
    state.rows = [];
    mockEnv();
    const { getSyncLogsKpis } = await import('./queries');
    const k = await getSyncLogsKpis();
    expect(k.total_7d).toBe(0);
    expect(k.errors_7d).toBe(0);
    expect(k.error_rate_7d).toBe(0);
  });
});

describe('getSyncLogDetail (P4.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.rows = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('retourne 1 row matchée par id', async () => {
    state.rows = [makeLog({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target: 'stripe' })];
    mockEnv();
    const { getSyncLogDetail } = await import('./queries');
    const row = await getSyncLogDetail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(row?.target).toBe('stripe');
  });

  it('id inconnu -> null', async () => {
    mockEnv();
    const { getSyncLogDetail } = await import('./queries');
    const row = await getSyncLogDetail('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(row).toBeNull();
  });
});
