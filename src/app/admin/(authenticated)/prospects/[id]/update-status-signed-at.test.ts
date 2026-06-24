/**
 * @vitest-environment node
 *
 * P5.x.ManualPaymentRecording (BUG 4) — updateProspectStatusAction pose
 * signed_at au 1er passage en 'signe' + updated_at sur tout changement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  before: { status: string; signed_at: string | null } | null;
  updates: Array<Record<string, unknown>>;
}
const state: State = { before: null, updates: [] };

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: 'admin', email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));
  vi.doMock('@/lib/admin/stands/actions', () => ({
    syncStandStatusFromProspect: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/brevo/sync-lifecycle', () => ({
    syncBrevoLifecycle: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () =>
      Promise.resolve({
        from: (table: string) => {
          if (table === 'prospects') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: state.before, error: null }),
                }),
              }),
              update: (patch: Record<string, unknown>) => ({
                eq: () => {
                  state.updates.push(patch);
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          if (table === 'audit_log') {
            return { insert: () => Promise.resolve({ error: null }) };
          }
          return {};
        },
      }),
  }));
}

beforeEach(() => {
  state.before = { status: 'devis_envoye', signed_at: null };
  state.updates = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('updateProspectStatusAction — signed_at (BUG 4)', () => {
  it('passage en signe (signed_at null) → pose signed_at + updated_at + status', async () => {
    mockEnv();
    const { updateProspectStatusAction } = await import('./actions');
    await updateProspectStatusAction('11111111-1111-4111-8111-111111111111', 'signe');
    const upd = state.updates[0];
    expect(upd.status).toBe('signe');
    expect(typeof upd.signed_at).toBe('string');
    expect(typeof upd.updated_at).toBe('string');
  });

  it('signe déjà signé (signed_at non-null) → ne réécrit PAS signed_at', async () => {
    state.before = { status: 'signe', signed_at: '2026-05-01T00:00:00Z' };
    mockEnv();
    const { updateProspectStatusAction } = await import('./actions');
    await updateProspectStatusAction('11111111-1111-4111-8111-111111111111', 'signe');
    expect(state.updates[0].signed_at).toBeUndefined();
  });

  it('autre statut (acompte_paye) → pas de signed_at, mais updated_at posé', async () => {
    mockEnv();
    const { updateProspectStatusAction } = await import('./actions');
    await updateProspectStatusAction('11111111-1111-4111-8111-111111111111', 'acompte_paye');
    expect(state.updates[0].signed_at).toBeUndefined();
    expect(typeof state.updates[0].updated_at).toBe('string');
  });
});
