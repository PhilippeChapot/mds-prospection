/**
 * @vitest-environment node
 *
 * P16.x.ImportPrograms — tests validation (single + bulk + cap 100).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';
const SPK = 'bb000000-0000-4000-8000-000000000002';

const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

function reset() {
  updates.length = 0;
  inserts.length = 0;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({ id: ADMIN_ID, role: 'admin' })),
    requireSuperAdmin: vi.fn(async () => ({ id: ADMIN_ID, role: 'super_admin' })),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => ({
        update: (row: Record<string, unknown>) => {
          updates.push({ table, row });
          return {
            eq: async () => ({ error: null }),
            in: (_col: string, ids: string[]) => ({
              select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }),
            }),
          };
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }));
}

async function load() {
  mockEnv();
  return import('./validation-actions');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('validateSpeakerAction (P16.x)', () => {
  it('passe is_validated=true + validated_by + audit speaker_validated', async () => {
    const { validateSpeakerAction } = await load();
    const res = await validateSpeakerAction(SPK);
    expect(res).toEqual({ success: true });
    const upd = updates.find((u) => u.table === 'speakers');
    expect(upd?.row.is_validated).toBe(true);
    expect(upd?.row.validated_by).toBe(ADMIN_ID);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_validated');
  });

  it('ID invalide → throw', async () => {
    const { validateSpeakerAction } = await load();
    await expect(validateSpeakerAction('nope')).rejects.toThrow();
  });
});

describe('bulkValidateSpeakersAction (P16.x)', () => {
  it('valide le lot + audit bulk + retourne le compte', async () => {
    const ids = [SPK, 'cc000000-0000-4000-8000-000000000003'];
    const { bulkValidateSpeakersAction } = await load();
    const res = await bulkValidateSpeakersAction(ids);
    expect(res).toEqual({ success: true, updated: 2 });
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_bulk_validated');
    expect((audit?.row.after as Record<string, unknown>).count).toBe(2);
  });

  it('plafonne à 100 ids', async () => {
    const ids = Array.from(
      { length: 150 },
      (_, i) => `aa000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const { bulkValidateConferencesAction } = await load();
    const res = await bulkValidateConferencesAction(ids);
    expect(res.updated).toBe(100);
  });
});
