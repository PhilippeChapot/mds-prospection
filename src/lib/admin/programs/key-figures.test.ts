/**
 * @vitest-environment node
 *
 * P16.x.ConferencesKeyFigures — extractKeyFigures (pur) + reExtractKeyFigures
 * (mode --re-extract).
 */

import { describe, it, expect, vi } from 'vitest';
import { extractKeyFigures, extractTargetAudience } from './parse-program';
import { reExtractKeyFigures } from './import-helpers';

describe('extractKeyFigures (P16.x)', () => {
  it('extrait les lignes entre CHIFFRES CLÉS et la section suivante', () => {
    const block = [
      'PITCH',
      'bla bla',
      'CHIFFRES CLÉS',
      'Marché IA : 4,18 Mds$ en 2026',
      '88 % des foyers équipés',
      'INTERVENANTS PRESSENTIS',
      'Nicolas Jaimes (Open Garden)',
    ];
    expect(extractKeyFigures(block)).toEqual([
      'Marché IA : 4,18 Mds$ en 2026',
      '88 % des foyers équipés',
    ]);
  });

  it('label insensible à la casse (Chiffres clés)', () => {
    const block = ['Chiffres clés', 'Stat A', 'Exposants potentiels', 'X'];
    expect(extractKeyFigures(block)).toEqual(['Stat A']);
  });

  it('limite à 5 chiffres', () => {
    const block = ['CHIFFRES CLÉS', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'INTERVENANTS PRESSENTIS'];
    expect(extractKeyFigures(block)).toHaveLength(5);
  });

  it('tronque à 200 caractères', () => {
    const long = 'x'.repeat(300);
    const block = ['CHIFFRES CLÉS', long, 'INTERVENANTS PRESSENTIS'];
    expect(extractKeyFigures(block)[0]).toHaveLength(200);
  });

  it('dédoublonne (insensible casse)', () => {
    const block = ['CHIFFRES CLÉS', 'Stat A', 'stat a', 'Stat B', 'INTERVENANTS PRESSENTIS'];
    expect(extractKeyFigures(block)).toEqual(['Stat A', 'Stat B']);
  });

  it('aucune section CHIFFRES CLÉS → []', () => {
    expect(extractKeyFigures(['PITCH', 'bla', 'INTERVENANTS PRESSENTIS'])).toEqual([]);
  });
});

describe('extractTargetAudience (P16.x)', () => {
  it('extrait le paragraphe entre PUBLIC VISÉ et la section suivante', () => {
    const block = [
      'PUBLIC VISÉ',
      'Directions innovation et technique des éditeurs (TV, radio).',
      'PITCH',
      'bla',
    ];
    expect(extractTargetAudience(block)).toBe(
      'Directions innovation et technique des éditeurs (TV, radio).',
    );
  });

  it('joint plusieurs lignes en un paragraphe', () => {
    const block = ['Public visé', 'Ligne A', 'Ligne B', 'CHIFFRES CLÉS', 'x'];
    expect(extractTargetAudience(block)).toBe('Ligne A Ligne B');
  });

  it('absent → null', () => {
    expect(extractTargetAudience(['PITCH', 'bla', 'CHIFFRES CLÉS'])).toBeNull();
  });
});

function mockDb(opts: {
  existing: { id: string; key_figures_fr: string[] | null } | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.existing, error: null }) }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          opts.onUpdate?.(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as never;
}

const conf = (keyFigures: string[], targetAudience: string | null = null) => ({
  title: 'T1. IA',
  pitch: null,
  poles: [],
  speakers: [],
  keyFigures,
  targetAudience,
});

describe('reExtractKeyFigures (P16.x --re-extract)', () => {
  it('conférence absente → not-found', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = mockDb({ existing: null });
    const r = await reExtractKeyFigures(db, conf(['a']), {
      programTrack: 'mds_solutions',
      forceOverwrite: false,
    });
    expect(r).toBe('not-found');
  });

  it('chiffres déjà saisis + pas de force → skipped-existing', async () => {
    const db = mockDb({ existing: { id: 'c1', key_figures_fr: ['déjà'] } });
    const r = await reExtractKeyFigures(db, conf(['nouveau']), {
      programTrack: 'mds_solutions',
      forceOverwrite: false,
    });
    expect(r).toBe('skipped-existing');
  });

  it('vide en base + nouveaux chiffres → updated', async () => {
    let patch: Record<string, unknown> | null = null;
    const db = mockDb({
      existing: { id: 'c1', key_figures_fr: null },
      onUpdate: (p) => (patch = p),
    });
    const r = await reExtractKeyFigures(db, conf(['Stat A', 'Stat B']), {
      programTrack: 'mds_solutions',
      forceOverwrite: false,
    });
    expect(r).toBe('updated');
    expect((patch as unknown as { key_figures_fr: string[] }).key_figures_fr).toEqual([
      'Stat A',
      'Stat B',
    ]);
  });

  it('déjà saisis + forceOverwrite → updated', async () => {
    const db = mockDb({ existing: { id: 'c1', key_figures_fr: ['vieux'] } });
    const r = await reExtractKeyFigures(db, conf(['neuf']), {
      programTrack: 'mds_solutions',
      forceOverwrite: true,
    });
    expect(r).toBe('updated');
  });

  it('public cible vide en base + extrait dispo → updated avec target_audience_fr', async () => {
    let patch: Record<string, unknown> | null = null;
    const db = mockDb({
      existing: { id: 'c1', key_figures_fr: ['déjà'] },
      onUpdate: (p) => (patch = p),
    });
    const r = await reExtractKeyFigures(db, conf([], 'Directeurs marketing & médias'), {
      programTrack: 'mds_solutions',
      forceOverwrite: false,
    });
    expect(r).toBe('updated');
    expect((patch as unknown as { target_audience_fr: string }).target_audience_fr).toBe(
      'Directeurs marketing & médias',
    );
  });
});
