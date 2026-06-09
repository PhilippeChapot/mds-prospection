/**
 * @vitest-environment node
 *
 * P14.2 #9 — tests reconcileGoogleEventToMds : sync responseStatus attendees.
 *
 * Couvre :
 *   - event mis à jour depuis Google → responseStatus des attendees propagé.
 *   - contact_id existant préservé lors du merge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AttendeeRecord } from '../helpers';

interface MockState {
  existing: {
    id: string;
    google_etag: string | null;
    user_id: string;
    attendees: AttendeeRecord[];
  } | null;
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
  contactsRows: Array<{ id: string; email: string }>;
}

const state: MockState = {
  existing: null,
  updates: [],
  inserts: [],
  contactsRows: [],
};

function reset() {
  state.existing = null;
  state.updates.length = 0;
  state.inserts.length = 0;
  state.contactsRows.length = 0;
}

function makeClient() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, _val: unknown) {
              return {
                maybeSingle: () => Promise.resolve({ data: state.existing, error: null }),
              };
            },
            in(_col: string, _vals: unknown[]) {
              return {
                then: (fn: (v: unknown) => unknown) =>
                  Promise.resolve({ data: state.contactsRows, error: null }).then(fn),
              };
            },
          };
        },
        update(fields: Record<string, unknown>) {
          return {
            eq: (_col: string, id: string) => {
              state.updates.push({ id, ...fields, _table: table });
              return Promise.resolve({ error: null });
            },
          };
        },
        delete() {
          return {
            eq: (_col: string, id: string) => {
              state.updates.push({ _action: 'delete', id });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push({ ...row, _table: table });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeClient() }));
}

describe('reconcileGoogleEventToMds — sync attendees (P14.2 #9)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('update event Google → responseStatus des attendees propagé', async () => {
    state.existing = {
      id: 'mds-5',
      google_etag: 'etag-old',
      user_id: 'u1',
      attendees: [
        {
          email: 'alice@example.com',
          displayName: 'Alice',
          contact_id: 'c-alice',
          responseStatus: 'needsAction',
        },
      ],
    };
    state.contactsRows = [{ id: 'c-alice', email: 'alice@example.com' }];
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g5',
      etag: 'etag-new',
      summary: 'Meeting mis à jour',
      status: 'confirmed',
      start: { dateTime: '2026-06-20T09:00:00Z' },
      end: { dateTime: '2026-06-20T10:00:00Z' },
      attendees: [{ email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' }],
    });
    expect(action).toBe('updated');
    const upd = state.updates.find((u) => u.id === 'mds-5');
    expect(upd).toBeDefined();
    const attendees = upd!.attendees as AttendeeRecord[];
    expect(attendees).toHaveLength(1);
    expect(attendees[0].email).toBe('alice@example.com');
    expect(attendees[0].responseStatus).toBe('accepted');
    // contact_id préservé depuis la row MDS existante.
    expect(attendees[0].contact_id).toBe('c-alice');
  });

  it('import nouvel event Google avec attendees → attendees stockés + contact_id résolu', async () => {
    state.existing = null;
    state.contactsRows = [{ id: 'c-bob', email: 'bob@example.com' }];
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g6',
      etag: 'etag-new',
      summary: 'Nouveau meeting importé',
      status: 'confirmed',
      start: { dateTime: '2026-06-21T14:00:00Z' },
      end: { dateTime: '2026-06-21T15:00:00Z' },
      attendees: [
        { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'accepted' },
        { email: 'carol@external.com', displayName: 'Carol', responseStatus: 'needsAction' },
      ],
    });
    expect(action).toBe('imported');
    expect(state.inserts).toHaveLength(1);
    const row = state.inserts[0];
    const attendees = row.attendees as AttendeeRecord[];
    expect(attendees).toHaveLength(2);
    const bob = attendees.find((a) => a.email === 'bob@example.com');
    expect(bob?.contact_id).toBe('c-bob');
    expect(bob?.responseStatus).toBe('accepted');
    const carol = attendees.find((a) => a.email === 'carol@external.com');
    expect(carol?.contact_id).toBeNull();
  });
});
