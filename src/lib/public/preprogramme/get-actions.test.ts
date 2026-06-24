/**
 * @vitest-environment node
 *
 * P16.x.PreProgrammeTeaser — tests getPreProgrammeAction (token, groupage
 * track, KPIs, répartition, locale) + parité labels.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  conferences: Array<Record<string, unknown>>;
  poles: Array<Record<string, unknown>>;
  speakers: Array<{ speaker_id: string }>;
}
const state: State = { conferences: [], poles: [], speakers: [] };

const TOKEN = 'secret-token-abc';

function thenable(data: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (r: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'conferences') return thenable(state.conferences);
        if (table === 'poles') return thenable(state.poles);
        if (table === 'conference_speakers') return thenable(state.speakers);
        return thenable([]);
      },
    }),
  }));
}

const POLES = [
  { code: 'AUDIO_RADIO', name_fr: 'Audio & Radio', name_en: 'Audio & Radio', color_hex: '#E94E8A' },
  { code: 'VIDEO_CTV', name_fr: 'Vidéo & CTV', name_en: 'Video & CTV', color_hex: '#294294' },
];

function conf(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    title_fr: 'Conf FR',
    title_en: 'Conf EN',
    description_fr: 'desc fr',
    description_en: 'desc en',
    program_track: 'mds_solutions',
    conference_type: 'panel',
    poles: ['AUDIO_RADIO'],
    target_audience_fr: 'Marketeurs',
    target_audience_en: 'Marketers',
    ...over,
  };
}

beforeEach(() => {
  state.conferences = [];
  state.poles = POLES;
  state.speakers = [];
  vi.stubEnv('PREPROGRAMME_TOKEN', TOKEN);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('getPreProgrammeAction (P16.x)', () => {
  it('token invalide → forbidden', async () => {
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction('wrong', 'fr');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden');
  });

  it('token vide → forbidden', async () => {
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction('', 'fr');
    expect(r.ok).toBe(false);
  });

  it('env PREPROGRAMME_TOKEN absent → forbidden même avec un token', async () => {
    vi.stubEnv('PREPROGRAMME_TOKEN', '');
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction('anything', 'fr');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden');
  });

  it('token valide + 0 conférence → empty', async () => {
    state.conferences = [];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'fr');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('KPI conferenceCount = nombre de conf', async () => {
    state.conferences = [conf({ id: 'c1' }), conf({ id: 'c2', program_track: 'prs_radio_audio' })];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'fr');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.kpis.conferenceCount).toBe(2);
  });

  it('groupage MDS vs PRS par program_track', async () => {
    state.conferences = [
      conf({ id: 'c1', program_track: 'mds_solutions' }),
      conf({ id: 'c2', program_track: 'prs_radio_audio' }),
      conf({ id: 'c3', program_track: 'mds_solutions' }),
    ];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'fr');
    if (r.ok) {
      expect(r.data.mds.map((c) => c.id)).toEqual(['c1', 'c3']);
      expect(r.data.prs.map((c) => c.id)).toEqual(['c2']);
    }
  });

  it('speakerCount = intervenants distincts', async () => {
    state.conferences = [conf()];
    state.speakers = [{ speaker_id: 's1' }, { speaker_id: 's2' }, { speaker_id: 's1' }];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'fr');
    if (r.ok) expect(r.data.kpis.speakerCount).toBe(2);
  });

  it('répartition par pôle (count + tri desc) + poleCount', async () => {
    state.conferences = [
      conf({ id: 'c1', poles: ['AUDIO_RADIO'] }),
      conf({ id: 'c2', poles: ['AUDIO_RADIO', 'VIDEO_CTV'] }),
    ];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'fr');
    if (r.ok) {
      expect(r.data.kpis.poleCount).toBe(2);
      expect(r.data.repartition[0].code).toBe('AUDIO_RADIO'); // 2 occurrences en tête
      expect(r.data.repartition[0].count).toBe(2);
      expect(r.data.repartition[0].colorHex).toBe('#E94E8A');
    }
  });

  it('locale en → titres + audience EN', async () => {
    state.conferences = [conf()];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'en');
    if (r.ok) {
      expect(r.data.mds[0].title).toBe('Conf EN');
      expect(r.data.mds[0].targetAudience).toBe('Marketers');
    }
  });

  it('locale en fallback title_fr si title_en null', async () => {
    state.conferences = [conf({ title_en: null })];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    const r = await getPreProgrammeAction(TOKEN, 'en');
    if (r.ok) expect(r.data.mds[0].title).toBe('Conf FR');
  });
});

describe('PREPROGRAMME_LABELS parité', () => {
  it('fr et en ont exactement les mêmes clés', async () => {
    const { PREPROGRAMME_LABELS } =
      await import('../../../app/[locale]/pre-programme/[token]/_components/labels');
    const frKeys = Object.keys(PREPROGRAMME_LABELS.fr).sort();
    const enKeys = Object.keys(PREPROGRAMME_LABELS.en).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('aucune valeur vide', async () => {
    const { PREPROGRAMME_LABELS } =
      await import('../../../app/[locale]/pre-programme/[token]/_components/labels');
    for (const loc of ['fr', 'en'] as const) {
      for (const v of Object.values(PREPROGRAMME_LABELS[loc])) {
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it('locale inconnue (non fr/en) traitée comme fr côté action (pas de crash)', async () => {
    state.conferences = [conf()];
    mockEnv();
    const { getPreProgrammeAction } = await import('./get-actions');
    // @ts-expect-error test défensif : locale hors union
    const r = await getPreProgrammeAction(TOKEN, 'de');
    expect(r.ok).toBe(true);
  });
});
