/**
 * @vitest-environment node
 *
 * P14.2.SalesCalendarGoogleSync — tests reconcileGoogleEventToMds (PULL).
 *
 * Couvre : cancelled→delete, cancelled-inconnu→skip, etag identique→skip
 * (anti-boucle), nouvel event→import, event lié→update, overlap 23P01→skip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  existing: { id: string; google_etag: string | null; user_id: string } | null;
  insertError: { code?: string; message?: string } | null;
  deletes: string[];
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
}

const state: MockState = {
  existing: null,
  insertError: null,
  deletes: [],
  updates: [],
  inserts: [],
};

function reset() {
  state.existing = null;
  state.insertError = null;
  state.deletes.length = 0;
  state.updates.length = 0;
  state.inserts.length = 0;
}

function makeClient() {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: state.existing, error: null }),
              };
            },
          };
        },
        delete() {
          return {
            eq: (_col: string, id: string) => {
              state.deletes.push(id);
              return Promise.resolve({ error: null });
            },
          };
        },
        update(fields: Record<string, unknown>) {
          return {
            eq: (_col: string, id: string) => {
              state.updates.push({ id, ...fields });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push(row);
          return Promise.resolve({ error: state.insertError });
        },
      };
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => makeClient() }));
}

describe('reconcileGoogleEventToMds (P14.2 PULL)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('event Google annulé + lié → supprime la row MDS', async () => {
    state.existing = { id: 'mds-1', google_etag: 'etag-old', user_id: 'u1' };
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', { id: 'g1', status: 'cancelled' });
    expect(action).toBe('deleted');
    expect(state.deletes).toContain('mds-1');
  });

  it('event Google annulé + inconnu → skip', async () => {
    state.existing = null;
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', { id: 'g1', status: 'cancelled' });
    expect(action).toBe('skipped');
    expect(state.deletes).toHaveLength(0);
  });

  it('etag identique → skip (anti-boucle push/pull)', async () => {
    state.existing = { id: 'mds-1', google_etag: 'etag-xyz', user_id: 'u1' };
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g1',
      etag: 'etag-xyz',
      status: 'confirmed',
      start: { dateTime: '2026-06-10T10:00:00Z' },
      end: { dateTime: '2026-06-10T11:00:00Z' },
    });
    expect(action).toBe('skipped');
    expect(state.updates).toHaveLength(0);
  });

  it('nouvel event Google → import (insert)', async () => {
    state.existing = null;
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g2',
      etag: 'etag-new',
      summary: 'RDV importé',
      status: 'confirmed',
      start: { dateTime: '2026-06-10T10:00:00Z' },
      end: { dateTime: '2026-06-10T11:00:00Z' },
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(action).toBe('imported');
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].google_calendar_event_id).toBe('g2');
    expect(state.inserts[0].meet_url).toBe('https://meet.google.com/abc-defg-hij');
    expect(state.inserts[0].user_id).toBe('u1');
  });

  it('event lié avec etag différent → update', async () => {
    state.existing = { id: 'mds-9', google_etag: 'etag-old', user_id: 'u1' };
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g9',
      etag: 'etag-fresh',
      summary: 'Modifié côté Google',
      status: 'confirmed',
      start: { dateTime: '2026-06-11T09:00:00Z' },
      end: { dateTime: '2026-06-11T09:30:00Z' },
    });
    expect(action).toBe('updated');
    expect(state.updates[0].id).toBe('mds-9');
    expect(state.updates[0].title).toBe('Modifié côté Google');
  });

  it('insert en overlap (23P01) → skip propre (pas de throw)', async () => {
    state.existing = null;
    state.insertError = { code: '23P01', message: 'overlap' };
    mockEnv();
    const { reconcileGoogleEventToMds } = await import('./pull-sync');
    const action = await reconcileGoogleEventToMds('u1', {
      id: 'g3',
      etag: 'e',
      summary: 'Chevauche',
      status: 'confirmed',
      start: { dateTime: '2026-06-10T10:00:00Z' },
      end: { dateTime: '2026-06-10T11:00:00Z' },
    });
    expect(action).toBe('skipped');
  });
});
