/**
 * @vitest-environment node
 *
 * P16.1 — tests actions speakers (create/list/update/confirm/delete).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';
const CONTACT_ID = 'cc000000-0000-4000-8000-000000000002';
const SPEAKER_ID = 'ee000000-0000-4000-8000-000000000003';

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
const deletes: Array<{ table: string }> = [];
const capturedEq: Array<{ col: string; val: unknown }> = [];

const scenario = {
  existingSpeaker: null as { id: string } | null,
  contactCompany: { company_id: 'co-existing' } as { company_id: string | null } | null,
  speakerRows: [] as Record<string, unknown>[],
  speakerCount: 0,
  superAdmin: true,
};

function reset() {
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  capturedEq.length = 0;
  scenario.existingSpeaker = null;
  scenario.contactCompany = { company_id: 'co-existing' };
  scenario.speakerRows = [];
  scenario.speakerCount = 0;
  scenario.superAdmin = true;
}

function insertId(table: string) {
  return { companies: 'co-new', contacts: 'ct-new', speakers: SPEAKER_ID }[table] ?? 'new-id';
}

function makeFrom(table: string) {
  const filters: Record<string, unknown> = {};
  let insertRow: Record<string, unknown> | null = null;
  const maybe = () => {
    if (table === 'speakers') return { data: scenario.existingSpeaker, error: null };
    if (table === 'contacts') return { data: scenario.contactCompany, error: null };
    return { data: null, error: null };
  };
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      inserts.push({ table, row });
      return chain;
    },
    update(row: Record<string, unknown>) {
      return {
        eq: async () => {
          updates.push({ table, row });
          return { error: null };
        },
      };
    },
    delete() {
      return {
        eq: async () => {
          deletes.push({ table });
          return { error: null };
        },
      };
    },
    eq(col: string, val: unknown) {
      capturedEq.push({ col, val });
      filters[col] = val;
      return chain;
    },
    in() {
      return chain;
    },
    order() {
      return chain;
    },
    range() {
      return chain;
    },
    maybeSingle: async () => maybe(),
    single: async () => ({ data: { id: insertId(table) }, error: null }),
    then: (resolve: (r: { data: unknown; error: null; count: number }) => unknown) =>
      Promise.resolve(
        resolve({ data: scenario.speakerRows, error: null, count: scenario.speakerCount }),
      ),
  };
  void insertRow;
  void filters;
  return chain;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({ id: ADMIN_ID, role: 'admin' })),
    requireSuperAdmin: vi.fn(async () => {
      if (!scenario.superAdmin) throw new Error('FORBIDDEN');
      return { id: ADMIN_ID, role: 'super_admin' };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeFrom(t) }),
  }));
}

async function loadCreate() {
  mockEnv();
  return (await import('./admin-create-actions')).createSpeakerFullAction;
}
async function loadMutate() {
  mockEnv();
  return import('./mutate-actions');
}
async function loadList() {
  mockEnv();
  return import('./list-actions');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('createSpeakerFullAction (P16.1)', () => {
  it('contact existant → insert speaker + audit speaker_created', async () => {
    const create = await loadCreate();
    const res = await create({ contact_id: CONTACT_ID, speaker_type: 'panel' });
    expect(res.speaker_id).toBe(SPEAKER_ID);
    const sp = inserts.find((i) => i.table === 'speakers');
    expect(sp?.row.contact_id).toBe(CONTACT_ID);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_created');
  });

  it('contact déjà speaker → throw', async () => {
    scenario.existingSpeaker = { id: 'sp-x' };
    const create = await loadCreate();
    await expect(create({ contact_id: CONTACT_ID })).rejects.toThrow(/déjà/);
  });
});

describe('mutate speakers (P16.1)', () => {
  it('updateSpeakerAction status=confirmed → confirmed_at + audit speaker_updated', async () => {
    const { updateSpeakerAction } = await loadMutate();
    await updateSpeakerAction(SPEAKER_ID, { status: 'confirmed', bio_short: 'Hello' });
    const upd = updates.find((u) => u.table === 'speakers');
    expect(upd?.row.status).toBe('confirmed');
    expect(upd?.row.confirmed_at).toBeTruthy();
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_updated');
  });

  it('confirmSpeakerAction → status confirmed + audit speaker_confirmed', async () => {
    const { confirmSpeakerAction } = await loadMutate();
    await confirmSpeakerAction(SPEAKER_ID);
    const upd = updates.find((u) => u.table === 'speakers');
    expect(upd?.row.status).toBe('confirmed');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('speaker_confirmed');
  });

  it('deleteSpeakerAction (super_admin) → delete + audit', async () => {
    const { deleteSpeakerAction } = await loadMutate();
    await deleteSpeakerAction(SPEAKER_ID);
    expect(deletes.some((d) => d.table === 'speakers')).toBe(true);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit?.row.action).toBe('delete');
  });

  it('deleteSpeakerAction non super_admin → throw', async () => {
    scenario.superAdmin = false;
    const { deleteSpeakerAction } = await loadMutate();
    await expect(deleteSpeakerAction(SPEAKER_ID)).rejects.toThrow('FORBIDDEN');
  });
});

describe('listSpeakersAction (P16.1)', () => {
  it('filtre status → eq appliqué + mappe conference_count', async () => {
    scenario.speakerCount = 1;
    scenario.speakerRows = [
      {
        id: SPEAKER_ID,
        speaker_type: 'keynote',
        status: 'confirmed',
        topics: ['IA'],
        language: 'fr',
        photo_url: null,
        confirmed_at: null,
        created_at: '2026-06-01T00:00:00Z',
        contact: { id: 'c1', first_name: 'A', last_name: 'B', email: 'a@b.fr', phone_mobile: null },
        company: { id: 'co1', name: 'ACME' },
        owner: { id: 'u1', full_name: 'Phil' },
        conference_speakers: [{ count: 3 }],
      },
    ];
    const { listSpeakersAction } = await loadList();
    const res = await listSpeakersAction({ status: 'confirmed' });
    expect(capturedEq).toContainEqual({ col: 'status', val: 'confirmed' });
    expect(res.total).toBe(1);
    expect(res.rows[0].conference_count).toBe(3);
    expect(res.rows[0].contact?.email).toBe('a@b.fr');
  });
});
