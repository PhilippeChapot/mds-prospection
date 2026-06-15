/**
 * @vitest-environment node
 *
 * P15.2 — tests createSpeakerAction (SHELL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';
const CONTACT_ID = 'cc000000-0000-4000-8000-000000000002';

const scenario = { existingSpeaker: null as { id: string } | null };
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

function reset() {
  scenario.existingSpeaker = null;
  inserts.length = 0;
}

function makeBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let insertRow: Record<string, unknown> | null = null;
  const terminal = () => {
    if (insertRow) return { data: { id: 'sp-new' }, error: null };
    if (table === 'speakers') return { data: scenario.existingSpeaker, error: null };
    if (table === 'contacts') return { data: { company_id: 'co-1' }, error: null };
    return { data: null, error: null };
  };
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      inserts.push({ table, row });
      return builder;
    },
    eq(c: string, v: unknown) {
      filters[c] = v;
      return builder;
    },
    maybeSingle: () => Promise.resolve(terminal()),
    single: () => Promise.resolve(terminal()),
    then: (resolve: (r: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  return builder;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: ADMIN_ID,
      email: 'a@mds.fr',
      full_name: 'Admin',
      role: 'admin' as const,
    })),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeBuilder(t) }),
  }));
}

async function load() {
  mockEnv();
  return (await import('./create-actions')).createSpeakerAction;
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('createSpeakerAction (P15.2)', () => {
  it('insert OK + audit_log kind speaker_created', async () => {
    const createSpeakerAction = await load();
    const res = await createSpeakerAction({ contact_id: CONTACT_ID, speaker_type: 'panel' });
    expect(res.success).toBe(true);
    expect(res.speaker_id).toBe('sp-new');
    const spInsert = inserts.find((i) => i.table === 'speakers');
    expect(spInsert?.row.contact_id).toBe(CONTACT_ID);
    expect(spInsert?.row.company_id).toBe('co-1');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_created');
  });

  it('contact déjà speaker → throw', async () => {
    scenario.existingSpeaker = { id: 'sp-existing' };
    const createSpeakerAction = await load();
    await expect(createSpeakerAction({ contact_id: CONTACT_ID })).rejects.toThrow(/déjà/);
  });
});
