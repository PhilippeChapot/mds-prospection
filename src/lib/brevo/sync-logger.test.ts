/**
 * @vitest-environment node
 *
 * P4.x.1 — tests logBrevoCall (target='brevo' dans sync_logs).
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

describe('logBrevoCall (P4.x.1)', () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.shouldFail = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it("insère une ligne sync_logs avec target='brevo'", async () => {
    const { logBrevoCall } = await import('./sync-logger');
    await logBrevoCall({
      entityType: 'prospects',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'update',
      status: 'success',
      payload: { flow: 'lifecycle' },
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe('sync_logs');
    expect(state.inserts[0].row).toMatchObject({
      target: 'brevo',
      operation: 'update',
      status: 'success',
      entity_type: 'prospects',
    });
  });

  it("status=error -> persiste status='error' + truncate error_message à 2000", async () => {
    const { logBrevoCall } = await import('./sync-logger');
    await logBrevoCall({
      entityType: 'prospects',
      entityId: '22222222-2222-4222-8222-222222222222',
      operation: 'update',
      status: 'error',
      errorMessage: 'X'.repeat(3000),
    });
    expect(state.inserts[0].row.status).toBe('error');
    expect((state.inserts[0].row.error_message as string).length).toBe(2000);
  });

  it('best-effort : DB down -> pas de throw, juste console.warn', async () => {
    state.shouldFail = true;
    const { logBrevoCall } = await import('./sync-logger');
    await expect(
      logBrevoCall({
        entityType: 'prospects',
        entityId: '33333333-3333-4333-8333-333333333333',
        operation: 'update',
        status: 'success',
      }),
    ).resolves.toBeUndefined();
    expect(state.inserts).toHaveLength(0);
  });
});
