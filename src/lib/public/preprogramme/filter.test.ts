/**
 * @vitest-environment node
 *
 * P16.x.PreProgrammeInteractive — logique de filtrage (pure) + dérivations +
 * find-by-slug (détail).
 */

import { describe, it, expect } from 'vitest';
import {
  filterConferences,
  derivePoleCounts,
  deriveTypeCounts,
  findConferenceBySlug,
} from './filter';
import type { PreProgrammeConference, ProgramTrack } from './types';

function pole(code: string) {
  return { code, name: code, colorHex: '#000000' };
}

function conf(over: Partial<PreProgrammeConference> & { id: string }): PreProgrammeConference {
  return {
    slug: over.id,
    track: 'mds_solutions' as ProgramTrack,
    title: 'Titre',
    description: null,
    conferenceType: null,
    targetAudience: null,
    keyFigures: [],
    poles: [],
    ...over,
  };
}

const NO_FILTER = { track: 'all', poles: [], types: [], q: '' };

const SET: PreProgrammeConference[] = [
  conf({
    id: 'a',
    track: 'mds_solutions',
    title: 'L’IA qui produit',
    poles: [pole('AUDIO_RADIO')],
    conferenceType: 'keynote',
  }),
  conf({
    id: 'b',
    track: 'prs_radio_audio',
    title: 'Radio & DAB+',
    poles: [pole('AUDIO_RADIO'), pole('DATA_ADTECH')],
    conferenceType: 'panel',
    description: 'tout sur le DAB+',
  }),
  conf({
    id: 'c',
    track: 'mds_solutions',
    title: 'CTV & FAST',
    poles: [pole('VIDEO_CTV')],
    conferenceType: 'panel',
    keyFigures: ['+34 % de croissance IA incluse'],
  }),
];

describe('filterConferences (P16.x)', () => {
  it('track mds → uniquement MDS', () => {
    const r = filterConferences(SET, { ...NO_FILTER, track: 'mds' });
    expect(r.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('track prs → uniquement PRS', () => {
    const r = filterConferences(SET, { ...NO_FILTER, track: 'prs' });
    expect(r.map((c) => c.id)).toEqual(['b']);
  });

  it('multi-pôle (OU) : audio OU data → a, b', () => {
    const r = filterConferences(SET, { ...NO_FILTER, poles: ['AUDIO_RADIO', 'DATA_ADTECH'] });
    expect(r.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('multi-type (OU) : keynote OU panel → tous', () => {
    const r = filterConferences(SET, { ...NO_FILTER, types: ['keynote', 'panel'] });
    expect(r).toHaveLength(3);
  });

  it('search "IA" matche le titre (a) ET les chiffres clés (c)', () => {
    const r = filterConferences(SET, { ...NO_FILTER, q: 'ia' });
    expect(r.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });

  it('search matche la description (DAB+)', () => {
    const r = filterConferences(SET, { ...NO_FILTER, q: 'dab+' });
    expect(r.map((c) => c.id)).toEqual(['b']);
  });

  it('filtres combinés : track mds + pôle AUDIO_RADIO → a seul', () => {
    const r = filterConferences(SET, { ...NO_FILTER, track: 'mds', poles: ['AUDIO_RADIO'] });
    expect(r.map((c) => c.id)).toEqual(['a']);
  });

  it('aucun filtre → toutes', () => {
    expect(filterConferences(SET, NO_FILTER)).toHaveLength(3);
  });

  it('trop restrictif → vide (empty state)', () => {
    const r = filterConferences(SET, { ...NO_FILTER, track: 'prs', poles: ['VIDEO_CTV'] });
    expect(r).toHaveLength(0);
  });
});

describe('derivePoleCounts / deriveTypeCounts (P16.x)', () => {
  it('compte les pôles, tri décroissant', () => {
    const r = derivePoleCounts(SET);
    expect(r[0]).toMatchObject({ code: 'AUDIO_RADIO', count: 2 });
    expect(r.find((p) => p.code === 'VIDEO_CTV')?.count).toBe(1);
  });

  it('compte les types, tri décroissant', () => {
    const r = deriveTypeCounts(SET);
    expect(r[0]).toMatchObject({ type: 'panel', count: 2 });
  });
});

describe('findConferenceBySlug (P16.x détail)', () => {
  it('slug valide → conférence', () => {
    expect(findConferenceBySlug(SET, 'b')?.id).toBe('b');
  });
  it('slug inconnu → null (→ notFound)', () => {
    expect(findConferenceBySlug(SET, 'zzz')).toBeNull();
  });
});
