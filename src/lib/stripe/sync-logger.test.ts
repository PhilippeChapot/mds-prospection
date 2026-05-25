/**
 * @vitest-environment node
 *
 * P6.x.8-bis — tests du helper logStripeCall (target='stripe' dans sync_logs).
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
        if (state.shouldFail) throw new Error('DB down');
        state.inserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

describe('logStripeCall (P6.x.8-bis)', () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.shouldFail = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it("insère une ligne sync_logs avec target='stripe' + success", async () => {
    const { logStripeCall } = await import('./sync-logger');
    await logStripeCall({
      entityType: 'prospects',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'create',
      status: 'success',
      payload: { flow: 'concierge', payment_link_id: 'plink_xxx' },
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].row).toMatchObject({
      target: 'stripe',
      operation: 'create',
      status: 'success',
      entity_type: 'prospects',
    });
  });

  it('status=error trunque error_message à 2000 chars', async () => {
    const { logStripeCall } = await import('./sync-logger');
    await logStripeCall({
      entityType: 'prospects',
      entityId: '22222222-2222-4222-8222-222222222222',
      operation: 'create',
      status: 'error',
      errorMessage: 'X'.repeat(3000),
    });
    expect(state.inserts[0].row.status).toBe('error');
    expect((state.inserts[0].row.error_message as string).length).toBe(2000);
  });

  it('best-effort : DB down → no throw', async () => {
    state.shouldFail = true;
    const { logStripeCall } = await import('./sync-logger');
    await expect(
      logStripeCall({
        entityType: 'prospects',
        entityId: '33333333-3333-4333-8333-333333333333',
        operation: 'create',
        status: 'success',
      }),
    ).resolves.toBeUndefined();
  });
});
