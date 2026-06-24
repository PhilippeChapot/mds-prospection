/**
 * @vitest-environment node
 *
 * P12.x fix — listEmails filtre "Reçus" (direction=inbound).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  eqCalls: Array<[string, unknown]>;
  rows: Array<Record<string, unknown>>;
}
const state: State = { eqCalls: [], rows: [] };

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'email_accounts') {
          // listAccountsForUser : select('*').eq('user_id').order()
          return {
            select: () => ({
              eq: () => ({ order: () => Promise.resolve({ data: [{ id: 'a1' }] }) }),
            }),
          };
        }
        // emails : builder chaînable thenable qui enregistre les .eq()
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.in = chain;
        builder.order = chain;
        builder.range = chain;
        builder.or = chain;
        builder.eq = (col: string, val: unknown) => {
          state.eqCalls.push([col, val]);
          return builder;
        };
        builder.then = (resolve: (v: unknown) => void) =>
          resolve({ data: state.rows, error: null, count: state.rows.length });
        return builder;
      },
    }),
  }));
}

beforeEach(() => {
  state.eqCalls = [];
  state.rows = [{ id: 'e1', direction: 'inbound' }];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('listEmails filtre Reçus (P12.x fix)', () => {
  it("filter='received' applique direction=inbound", async () => {
    mockEnv();
    const { listEmails } = await import('./queries');
    const res = await listEmails({ userId: 'u1', filter: 'received' });
    expect(state.eqCalls).toContainEqual(['direction', 'inbound']);
    expect(res.rows).toHaveLength(1);
  });

  it("filter='sent' applique direction=outbound", async () => {
    mockEnv();
    const { listEmails } = await import('./queries');
    await listEmails({ userId: 'u1', filter: 'sent' });
    expect(state.eqCalls).toContainEqual(['direction', 'outbound']);
  });
});
