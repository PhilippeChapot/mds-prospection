/**
 * @vitest-environment node
 *
 * P16.x.ConferencesKeyFigures — translateConferenceAction (Haiku 4.5 mocké).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  role: 'admin' | 'sales' | 'super_admin';
  conf: Record<string, unknown> | null;
  updates: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  aiText: string;
  bulkRows: Array<Record<string, unknown>>;
}
const state: State = {
  role: 'admin',
  conf: null,
  updates: [],
  audits: [],
  aiText: '',
  bulkRows: [],
};

const CID = '11111111-1111-4111-8111-111111111111';

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: state.role, email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class {
      messages = {
        create: () => Promise.resolve({ content: [{ type: 'text', text: state.aiText }] }),
      };
    },
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'conferences') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.conf, error: null }) }),
              or: () => Promise.resolve({ data: state.bulkRows, error: null }),
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
          return {
            insert: (row: Record<string, unknown>) => {
              state.audits.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

beforeEach(() => {
  state.role = 'admin';
  state.conf = {
    id: CID,
    title_fr: 'IA en radio',
    description_fr: 'desc fr',
    target_audience_fr: 'Radios',
    key_figures_fr: ['50 % des adultes utilisent l’IA', '47 % moins enclins'],
  };
  state.updates = [];
  state.audits = [];
  state.bulkRows = [];
  state.aiText =
    'Voici: { "title_en": "AI in radio", "description_en": "desc en", "target_audience_en": "Radios", "key_figures_en": ["50% of adults use AI", "47% less inclined"] }';
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('translateConferenceAction (P16.x)', () => {
  it('happy path → écrit title_en + key_figures_en + audit', async () => {
    mockEnv();
    const { translateConferenceAction } = await import('./translate-actions');
    const r = await translateConferenceAction({ conference_id: CID });
    expect(r.ok).toBe(true);
    const upd = state.updates[0];
    expect(upd.title_en).toBe('AI in radio');
    expect(upd.key_figures_en).toEqual(['50% of adults use AI', '47% less inclined']);
    expect((state.audits[0].after as { kind: string }).kind).toBe('conference_translated_by_ai');
  });

  it('réponse sans JSON → erreur, pas d’update', async () => {
    state.aiText = 'désolé je ne peux pas';
    mockEnv();
    const { translateConferenceAction } = await import('./translate-actions');
    const r = await translateConferenceAction({ conference_id: CID });
    expect(r.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('role sales → refusé', async () => {
    state.role = 'sales';
    mockEnv();
    const { translateConferenceAction } = await import('./translate-actions');
    const r = await translateConferenceAction({ conference_id: CID });
    expect(r.ok).toBe(false);
  });

  it('ANTHROPIC_API_KEY absent → erreur', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    mockEnv();
    const { translateConferenceAction } = await import('./translate-actions');
    const r = await translateConferenceAction({ conference_id: CID });
    expect(r.ok).toBe(false);
  });

  it('key_figures_en limité à 5', async () => {
    state.aiText =
      '{ "title_en": "t", "description_en": null, "target_audience_en": null, "key_figures_en": ["1","2","3","4","5","6","7"] }';
    mockEnv();
    const { translateConferenceAction } = await import('./translate-actions');
    await translateConferenceAction({ conference_id: CID });
    expect((state.updates[0].key_figures_en as string[]).length).toBe(5);
  });
});

describe('translateConferenceFieldAction (P16.x inline)', () => {
  it('champ texte → renvoie text EN (sans écrire en DB)', async () => {
    state.aiText = '{ "text": "Target audience EN" }';
    mockEnv();
    const { translateConferenceFieldAction } = await import('./translate-actions');
    const r = await translateConferenceFieldAction({
      field: 'target_audience',
      source_text: 'Public FR',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('Target audience EN');
    expect(state.updates).toHaveLength(0); // pas d'écriture DB
  });

  it('champ key_figures → renvoie list EN (max 5)', async () => {
    state.aiText = '{ "list": ["a","b","c","d","e","f"] }';
    mockEnv();
    const { translateConferenceFieldAction } = await import('./translate-actions');
    const r = await translateConferenceFieldAction({
      field: 'key_figures',
      source_list: ['x', 'y'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list).toHaveLength(5);
  });

  it('source vide → erreur', async () => {
    mockEnv();
    const { translateConferenceFieldAction } = await import('./translate-actions');
    const r = await translateConferenceFieldAction({ field: 'description', source_text: '' });
    expect(r.ok).toBe(false);
  });

  it('role sales → refusé', async () => {
    state.role = 'sales';
    mockEnv();
    const { translateConferenceFieldAction } = await import('./translate-actions');
    const r = await translateConferenceFieldAction({ field: 'title', source_text: 'Titre' });
    expect(r.ok).toBe(false);
  });
});

describe('generateConferenceTargetAudienceAction (P16.x)', () => {
  it('happy path → renvoie le texte sans écrire en DB', async () => {
    state.aiText = 'Directeurs d’antenne · Responsables programmation · Régies radio';
    mockEnv();
    const { generateConferenceTargetAudienceAction } = await import('./translate-actions');
    const r = await generateConferenceTargetAudienceAction({ conference_id: CID });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.text).toBe('Directeurs d’antenne · Responsables programmation · Régies radio');
    expect(state.updates).toHaveLength(0);
  });

  it('strip préambule "Public cible :" + point final', async () => {
    state.aiText = 'Public cible : Directeurs marketing · Régies.';
    mockEnv();
    const { generateConferenceTargetAudienceAction } = await import('./translate-actions');
    const r = await generateConferenceTargetAudienceAction({ conference_id: CID });
    if (r.ok) expect(r.text).toBe('Directeurs marketing · Régies');
  });

  it('description vide → erreur', async () => {
    state.conf = { id: CID, title_fr: 'T', description_fr: '' };
    mockEnv();
    const { generateConferenceTargetAudienceAction } = await import('./translate-actions');
    const r = await generateConferenceTargetAudienceAction({ conference_id: CID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/description/i);
  });

  it('strip guillemets englobants + ne garde que la 1re ligne', async () => {
    state.aiText = '« Directeurs · Régies »\nNote: blabla';
    mockEnv();
    const { generateConferenceTargetAudienceAction } = await import('./translate-actions');
    const r = await generateConferenceTargetAudienceAction({ conference_id: CID });
    if (r.ok) expect(r.text).toBe('Directeurs · Régies');
  });

  it('role sales → refusé', async () => {
    state.role = 'sales';
    mockEnv();
    const { generateConferenceTargetAudienceAction } = await import('./translate-actions');
    const r = await generateConferenceTargetAudienceAction({ conference_id: CID });
    expect(r.ok).toBe(false);
  });
});

describe('generateAllMissingTargetAudienceAction (P16.x bulk)', () => {
  it('super_admin → génère + sauve les conf sans public cible', async () => {
    state.role = 'super_admin';
    state.bulkRows = [{ id: CID, target_audience_fr: null, description_fr: 'desc' }];
    state.aiText = 'Directeurs · Régies';
    mockEnv();
    const { generateAllMissingTargetAudienceAction } = await import('./translate-actions');
    const r = await generateAllMissingTargetAudienceAction();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.generated).toBe(1);
    expect(state.updates[0].target_audience_fr).toBe('Directeurs · Régies');
  });

  it('admin (non super) → refusé', async () => {
    state.role = 'admin';
    state.bulkRows = [{ id: CID, target_audience_fr: null, description_fr: 'desc' }];
    mockEnv();
    const { generateAllMissingTargetAudienceAction } = await import('./translate-actions');
    const r = await generateAllMissingTargetAudienceAction();
    expect(r.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('aucune conf manquante → generated 0', async () => {
    state.role = 'super_admin';
    state.bulkRows = [{ id: CID, target_audience_fr: 'déjà', description_fr: 'desc' }];
    mockEnv();
    const { generateAllMissingTargetAudienceAction } = await import('./translate-actions');
    const r = await generateAllMissingTargetAudienceAction();
    if (r.ok) expect(r.generated).toBe(0);
  });
});
