/**
 * @vitest-environment node
 *
 * P5.x.Apollo — tests logApolloCall (target='apollo' dans sync_logs).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = {
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
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

describe('logApolloCall (P5.x.Apollo)', () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.shouldFail = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it("insère une ligne sync_logs avec target='apollo'", async () => {
    const { logApolloCall } = await import('./sync-logger');
    await logApolloCall({
      entityType: 'companies',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'pull',
      status: 'success',
      payload: { domain: 'tf1pub.fr' },
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].row).toMatchObject({
      target: 'apollo',
      operation: 'pull',
      status: 'success',
    });
  });

  it('status=error -> truncate error_message', async () => {
    const { logApolloCall } = await import('./sync-logger');
    await logApolloCall({
      entityType: 'companies',
      entityId: '22222222-2222-4222-8222-222222222222',
      operation: 'pull',
      status: 'error',
      errorMessage: 'X'.repeat(3000),
    });
    expect(state.inserts[0].row.status).toBe('error');
    expect((state.inserts[0].row.error_message as string).length).toBe(2000);
  });

  it('best-effort : DB down -> no throw', async () => {
    state.shouldFail = true;
    const { logApolloCall } = await import('./sync-logger');
    await expect(
      logApolloCall({
        entityType: 'companies',
        entityId: '33333333-3333-4333-8333-333333333333',
        operation: 'pull',
        status: 'success',
      }),
    ).resolves.toBeUndefined();
  });
});
