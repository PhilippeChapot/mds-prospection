/**
 * @vitest-environment node
 *
 * P16.3 — tests conférences (slug, create+overlap, junction attach/detach/reorder).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSlug } from './slug';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';
const CONF_ID = 'ff000000-0000-4000-8000-000000000002';
const SPK_ID = 'ee000000-0000-4000-8000-000000000003';

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
const deletes: string[] = [];

const scenario = {
  overlapHits: [] as Record<string, unknown>[],
  slugTaken: false,
  existingJunction: null as { speaker_id: string } | null,
  junctionCount: 0,
};

function reset() {
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  scenario.overlapHits = [];
  scenario.slugTaken = false;
  scenario.existingJunction = null;
  scenario.junctionCount = 0;
}

function makeChain(table: string) {
  let insertRow: Record<string, unknown> | null = null;
  let updateRow: Record<string, unknown> | null = null;
  let isDelete = false;
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      return chain;
    },
    update(row: Record<string, unknown>) {
      updateRow = row;
      return chain;
    },
    delete() {
      isDelete = true;
      return chain;
    },
    eq() {
      return chain;
    },
    neq() {
      return chain;
    },
    lte() {
      return chain;
    },
    gte() {
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
    limit() {
      return chain;
    },
    maybeSingle: async () => {
      if (table === 'conferences')
        return { data: scenario.slugTaken ? { id: 'dupe' } : null, error: null };
      if (table === 'conference_speakers') return { data: scenario.existingJunction, error: null };
      return { data: null, error: null };
    },
    single: async () => {
      if (insertRow) inserts.push({ table, row: insertRow });
      return { data: { id: CONF_ID }, error: null };
    },
    then: (resolve: (r: { data: unknown; error: null; count: number }) => unknown) => {
      if (insertRow) {
        inserts.push({ table, row: insertRow });
        return Promise.resolve(resolve({ data: null, error: null, count: 0 }));
      }
      if (updateRow) {
        updates.push({ table, row: updateRow });
        return Promise.resolve(resolve({ data: null, error: null, count: 0 }));
      }
      if (isDelete) {
        deletes.push(table);
        return Promise.resolve(resolve({ data: null, error: null, count: 0 }));
      }
      if (table === 'conferences') {
        return Promise.resolve(resolve({ data: scenario.overlapHits, error: null, count: 0 }));
      }
      // conference_speakers count head
      return Promise.resolve(resolve({ data: [], error: null, count: scenario.junctionCount }));
    },
  };
  return chain;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({ id: ADMIN_ID, role: 'admin' })),
    requireSuperAdmin: vi.fn(async () => ({ id: ADMIN_ID, role: 'super_admin' })),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeChain(t) }),
  }));
}

async function loadCrud() {
  mockEnv();
  return import('./crud-actions');
}
async function loadJunction() {
  mockEnv();
  return import('./speaker-junction-actions');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('generateSlug (P16.3)', () => {
  it('slugifie, retire accents et caractères spéciaux', () => {
    expect(generateSlug("L'avenir de l'Audio Digital & IA !")).toBe(
      'l-avenir-de-l-audio-digital-ia',
    );
  });
});

describe('createConferenceAction (P16.3)', () => {
  it('sans overlap → insert + slug + audit conference_created', async () => {
    const { createConferenceAction } = await loadCrud();
    const res = await createConferenceAction({
      title_fr: 'Keynote IA',
      is_published: false,
      featured: false,
    });
    expect(res.conference_id).toBe(CONF_ID);
    const conf = inserts.find((i) => i.table === 'conferences');
    expect(conf?.row.slug).toBe('keynote-ia');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('conference_created');
  });

  it('avec overlap → warning console, pas de throw', async () => {
    scenario.overlapHits = [{ id: 'x', title_fr: 'Autre', start_at: null, end_at: null }];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createConferenceAction } = await loadCrud();
    const res = await createConferenceAction({
      title_fr: 'Conflit',
      room: 'Salle A',
      start_at: '2026-12-15T09:00:00Z',
      end_at: '2026-12-15T10:00:00Z',
      is_published: false,
      featured: false,
    });
    expect(res.conference_id).toBe(CONF_ID);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('checkConferenceOverlapAction (P16.3)', () => {
  it('retourne les conflits de salle', async () => {
    scenario.overlapHits = [
      {
        id: 'c1',
        title_fr: 'Déjà là',
        start_at: '2026-12-15T09:00:00Z',
        end_at: '2026-12-15T10:00:00Z',
      },
    ];
    const { checkConferenceOverlapAction } = await loadCrud();
    const hits = await checkConferenceOverlapAction({
      room: 'Salle A',
      start_at: '2026-12-15T09:30:00Z',
      end_at: '2026-12-15T10:30:00Z',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].title_fr).toBe('Déjà là');
  });
});

describe('junction (P16.3)', () => {
  it('attach → insert conference_speakers + audit', async () => {
    const { attachSpeakerToConferenceAction } = await loadJunction();
    await attachSpeakerToConferenceAction({
      conference_id: CONF_ID,
      speaker_id: SPK_ID,
      role: 'panelist',
    });
    const j = inserts.find((i) => i.table === 'conference_speakers');
    expect(j?.row.speaker_id).toBe(SPK_ID);
    expect(j?.row.role).toBe('panelist');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('conference_speaker_attached');
  });

  it('attach déjà rattaché → throw', async () => {
    scenario.existingJunction = { speaker_id: SPK_ID };
    const { attachSpeakerToConferenceAction } = await loadJunction();
    await expect(
      attachSpeakerToConferenceAction({ conference_id: CONF_ID, speaker_id: SPK_ID }),
    ).rejects.toThrow(/déjà/);
  });

  it('detach → delete conference_speakers', async () => {
    const { detachSpeakerFromConferenceAction } = await loadJunction();
    await detachSpeakerFromConferenceAction({ conference_id: CONF_ID, speaker_id: SPK_ID });
    expect(deletes).toContain('conference_speakers');
  });

  it('reorder → update speaking_order pour chaque speaker', async () => {
    const { reorderConferenceSpeakersAction } = await loadJunction();
    await reorderConferenceSpeakersAction({
      conference_id: CONF_ID,
      ordered_speaker_ids: ['s1', 's2', 's3'],
    });
    const orderUpdates = updates.filter((u) => u.table === 'conference_speakers');
    expect(orderUpdates).toHaveLength(3);
    expect(orderUpdates[2].row.speaking_order).toBe(2);
  });
});
