/**
 * @vitest-environment node
 *
 * P8.2 — tests updateMyContactProfileAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  sessionThrows: false as boolean | string,
  contactId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  updates: [] as Array<{ patch: Record<string, unknown> }>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/espace-exposant/session', () => ({
    requireContactSession: vi.fn(async () => {
      if (state.sessionThrows) throw new Error(String(state.sessionThrows));
      return { contactId: state.contactId, prospectId: null };
    }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: () => makeChain() };
}

function makeChain() {
  let pendingPatch: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    eq: () => chain,
    then: (onfulfilled: (v: { error: null }) => unknown) => {
      if (pendingPatch) state.updates.push({ patch: pendingPatch });
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

describe('updateMyContactProfileAction (P8.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.sessionThrows = false;
    state.updates = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('met a jour first_name + last_name + phone + language', async () => {
    mockEnv();
    const { updateMyContactProfileAction } = await import('./profile-actions');
    const r = await updateMyContactProfileAction({
      locale: 'fr',
      first_name: 'Alice',
      last_name: 'Martin',
      phone: '+33 6 12 34 56 78',
      language: 'EN',
    });
    expect(r.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({
      first_name: 'Alice',
      last_name: 'Martin',
      phone: '+33 6 12 34 56 78',
      language: 'EN',
    });
  });

  it('phone vide -> patch phone=null (clear)', async () => {
    mockEnv();
    const { updateMyContactProfileAction } = await import('./profile-actions');
    const r = await updateMyContactProfileAction({
      locale: 'fr',
      phone: '',
    });
    expect(r.ok).toBe(true);
    expect(state.updates[0].patch).toEqual({ phone: null });
  });

  it('session invalide -> ok:false', async () => {
    state.sessionThrows = 'no session';
    mockEnv();
    const { updateMyContactProfileAction } = await import('./profile-actions');
    const r = await updateMyContactProfileAction({ locale: 'fr', first_name: 'X' });
    expect(r.ok).toBe(false);
  });

  it('language invalide -> ok:false (Zod reject)', async () => {
    mockEnv();
    const { updateMyContactProfileAction } = await import('./profile-actions');
    const r = await updateMyContactProfileAction({
      locale: 'fr',
      language: 'DE' as unknown as 'FR',
    });
    expect(r.ok).toBe(false);
  });
});
