/**
 * @vitest-environment node
 *
 * P6.x.6 — tests du helper logSellsyCall (sync_logs).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface MockState {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  shouldFail: boolean;
}

const state: MockState = {
  inserts: [],
  shouldFail: false,
};

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (state.shouldFail) {
          throw new Error('DB down');
        }
        state.inserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

describe('logSellsyCall (P6.x.6)', () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.shouldFail = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('insère une ligne sync_logs avec target=sellsy + status=success', async () => {
    const { logSellsyCall } = await import('./sync-logger');
    await logSellsyCall({
      entityType: 'prospects',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'create',
      status: 'success',
      payload: { sellsy_devis_id: 52437785 },
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe('sync_logs');
    expect(state.inserts[0].row).toMatchObject({
      entity_type: 'prospects',
      entity_id: '11111111-1111-4111-8111-111111111111',
      target: 'sellsy',
      operation: 'create',
      status: 'success',
    });
    expect(state.inserts[0].row.error_message).toBeNull();
  });

  it('insère une ligne sync_logs avec status=error + error_message tronqué', async () => {
    const { logSellsyCall } = await import('./sync-logger');
    const longErr = 'X'.repeat(3000);
    await logSellsyCall({
      entityType: 'contacts',
      entityId: '22222222-2222-4222-8222-222222222222',
      operation: 'create',
      status: 'error',
      errorMessage: longErr,
      payload: { sellsy_error: { code: 400 } },
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].row.status).toBe('error');
    expect((state.inserts[0].row.error_message as string).length).toBe(2000);
  });

  it('best-effort : DB down → console.warn et pas de throw', async () => {
    state.shouldFail = true;
    const { logSellsyCall } = await import('./sync-logger');
    await expect(
      logSellsyCall({
        entityType: 'prospects',
        entityId: '33333333-3333-4333-8333-333333333333',
        operation: 'create',
        status: 'success',
      }),
    ).resolves.toBeUndefined();
    expect(state.inserts).toHaveLength(0);
  });
});
