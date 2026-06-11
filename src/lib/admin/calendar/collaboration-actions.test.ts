/**
 * P14.5.CalendarCollaboration — tests des server actions de collaboration.
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// UUIDs stables pour les tests
const ID = {
  admin: '11111111-1111-4111-8111-111111111111',
  sales: '22222222-2222-4222-8222-222222222222',
  other: '33333333-3333-4333-8333-333333333333',
  evtA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  evtB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

// ─── Shared in-memory state ───

const DB = {
  event: null as Record<string, unknown> | null,
  assigneeIds: [] as string[],
  visibilityRows: [] as Array<{ user_id: string; visible_user_id: string }>,
  emailsSent: [] as string[],
};

function makeSupabase() {
  return {
    from(table: string) {
      if (table === 'calendar_events') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          update: (payload: Record<string, unknown>) => {
            if (DB.event && payload.assignee_user_ids) {
              DB.assigneeIds = payload.assignee_user_ids as string[];
            }
            // update() returns a builder, need eq() then resolve
            const upChain: Record<string, unknown> = {
              eq: () => Promise.resolve({ error: null }),
            };
            return upChain;
          },
          maybeSingle: () => Promise.resolve({ data: DB.event, error: null }),
        };
        return chain;
      }
      if (table === 'users') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: { full_name: 'Admin One', email: 'admin@mds.io', language: 'FR' },
              error: null,
            }),
          then: (fn: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [
                {
                  id: ID.sales,
                  email: 'sales@mds.io',
                  full_name: 'Sales Two',
                  language: 'FR',
                },
              ],
              error: null,
            }).then(fn),
        };
        return chain;
      }
      if (table === 'audit_log') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === 'user_calendar_visibility') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          _userFilter: '',
          _visibleFilter: '',
          select: () => chain,
          eq: (col: string, val: string) => {
            if (col === 'user_id') chain._userFilter = val;
            if (col === 'visible_user_id') chain._visibleFilter = val;
            return chain;
          },
          insert: (row: { user_id: string; visible_user_id: string }) => {
            DB.visibilityRows.push(row);
            return Promise.resolve({ error: null });
          },
          delete: () => chain,
          maybeSingle: () => {
            const found = DB.visibilityRows.find(
              (r) => r.user_id === chain._userFilter && r.visible_user_id === chain._visibleFilter,
            );
            return Promise.resolve({ data: found ?? null, error: null });
          },
        };
        return chain;
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    },
  };
}

function mockDeps(role: 'admin' | 'sales' | 'super_admin' = 'admin') {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve({ id: ID.admin, role, email: 'admin@mds.io', full_name: 'Admin One' }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeSupabase(),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(({ to }: { to: string }) => {
      DB.emailsSent.push(to);
      return Promise.resolve({ id: 'email-id' });
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
}

describe('assignEventToUsersAction (P14.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    DB.event = {
      id: ID.evtA,
      user_id: ID.admin,
      title: 'Démo Acme',
      start_at: '2026-06-15T10:00:00.000Z',
    };
    DB.assigneeIds = [];
    DB.emailsSent = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('assigne des users sans alerte email', async () => {
    mockDeps('admin');
    const { assignEventToUsersAction } = await import('./collaboration-actions');
    const r = await assignEventToUsersAction({
      event_id: ID.evtA,
      assignee_user_ids: [ID.sales],
      notify_urgent: false,
    });
    expect(r.ok).toBe(true);
    expect(DB.emailsSent).toHaveLength(0);
  });

  it('sales ne peut pas assigner', async () => {
    mockDeps('sales');
    const { assignEventToUsersAction } = await import('./collaboration-actions');
    const r = await assignEventToUsersAction({
      event_id: ID.evtA,
      assignee_user_ids: [ID.sales],
      notify_urgent: false,
    });
    expect(r.ok).toBe(false);
    expect('error' in r && r.error).toMatch(/sales/i);
  });

  it('super_admin peut assigner un event dont il n est pas propriétaire', async () => {
    mockDeps('super_admin');
    DB.event = {
      id: ID.evtB,
      user_id: ID.other,
      title: 'Autre',
      start_at: '2026-06-20T09:00:00.000Z',
    };
    const { assignEventToUsersAction } = await import('./collaboration-actions');
    const r = await assignEventToUsersAction({
      event_id: ID.evtB,
      assignee_user_ids: [ID.sales],
      notify_urgent: false,
    });
    expect(r.ok).toBe(true);
  });
});

describe('toggleCalendarVisibilityAction (P14.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    DB.visibilityRows = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('toggle ON : insère une entrée de visibilité', async () => {
    mockDeps();
    const { toggleCalendarVisibilityAction } = await import('./collaboration-actions');
    const r = await toggleCalendarVisibilityAction({ visible_user_id: ID.sales });
    expect(r.ok).toBe(true);
    expect(DB.visibilityRows).toHaveLength(1);
    expect(DB.visibilityRows[0].visible_user_id).toBe(ID.sales);
  });
});

describe('listVisibleCalendarUsersAction (P14.5)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('retourne les IDs visibles depuis la DB', async () => {
    vi.doMock('@/lib/supabase/auth-helpers', () => ({
      requireAdminProfile: () =>
        Promise.resolve({ id: ID.admin, role: 'admin', email: 'admin@mds.io', full_name: 'Admin' }),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from(_: string) {
          return {
            select: () => this.from(''),
            eq: () => Promise.resolve({ data: [{ visible_user_id: ID.sales }], error: null }),
          };
        },
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    const { listVisibleCalendarUsersAction } = await import('./collaboration-actions');
    const r = await listVisibleCalendarUsersAction();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Array.isArray(r.visibleUserIds)).toBe(true);
    }
  });
});
