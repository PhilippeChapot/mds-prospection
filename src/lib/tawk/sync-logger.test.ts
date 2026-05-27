/**
 * @vitest-environment node
 *
 * P9.1 — tests logTawkCall (best-effort insert sync_logs target='tawk').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const inserts: Array<Record<string, unknown>> = [];
let throwOnInsert = false;

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (_table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (throwOnInsert) throw new Error('db down');
        inserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

describe('logTawkCall (P9.1)', () => {
  beforeEach(() => {
    inserts.length = 0;
    throwOnInsert = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("insere une ligne sync_logs avec target='tawk'", async () => {
    const { logTawkCall } = await import('./sync-logger');
    await logTawkCall({
      entityType: 'prospects',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'create',
      status: 'success',
      payload: { foo: 'bar' },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      target: 'tawk',
      entity_type: 'prospects',
      entity_id: '11111111-1111-4111-8111-111111111111',
      operation: 'create',
      status: 'success',
    });
  });

  it('best-effort : un insert qui throw NE remonte JAMAIS au caller', async () => {
    throwOnInsert = true;
    const { logTawkCall } = await import('./sync-logger');
    // Doit resoudre sans throw.
    await expect(
      logTawkCall({
        entityType: 'prospects',
        entityId: '00000000-0000-0000-0000-000000000000',
        operation: 'create',
        status: 'error',
        errorMessage: 'boom',
      }),
    ).resolves.toBeUndefined();
  });

  it('error_message tronque a 2000 chars', async () => {
    const { logTawkCall } = await import('./sync-logger');
    const huge = 'x'.repeat(5000);
    await logTawkCall({
      entityType: 'chat_lead',
      entityId: '00000000-0000-0000-0000-000000000000',
      operation: 'create',
      status: 'error',
      errorMessage: huge,
    });
    expect(inserts).toHaveLength(1);
    expect((inserts[0].error_message as string).length).toBe(2000);
  });
});
