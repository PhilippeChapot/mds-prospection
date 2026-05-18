/**
 * @vitest-environment node
 *
 * P6.x.2a-ter — tests du plan Canva exact (69 stands).
 *
 * Source de vérité : LE_NOTRE_PLAN_STANDS dans seeds.ts. La migration SQL
 * 0048 doit rester synchronisée avec cette structure.
 */

import { describe, it, expect } from 'vitest';
import { LE_NOTRE_PLAN_STANDS, LE_NOTRE_PLAN_NUMBERS } from './seeds';

describe('LE_NOTRE_PLAN_STANDS (P6.x.2a-ter)', () => {
  it('contient exactement 69 stands', () => {
    expect(LE_NOTRE_PLAN_STANDS).toHaveLength(69);
  });

  it('"trous" attendus dans le plan Canva : A0, A5, H0, H1, H5, H6, H7, H8 ABSENTS', () => {
    const holes = ['A0', 'A5', 'H0', 'H1', 'H5', 'H6', 'H7', 'H8'];
    for (const num of holes) {
      expect(LE_NOTRE_PLAN_NUMBERS.has(num)).toBe(false);
    }
  });

  it('Rangée A : 9 stands à 6 m² tous AUDIO_RADIO (A1-A4, A6-A10)', () => {
    const row = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === 'A');
    expect(row).toHaveLength(9);
    expect(row.every((s) => s.taille_m2 === 6)).toBe(true);
    expect(row.every((s) => s.pole_recommended === 'AUDIO_RADIO')).toBe(true);
    expect(row.map((s) => s.col).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
  });

  it('Rangées B/C/D : col 0 = DATA_ADTECH 6m², cols 1-8 = AUDIO_RADIO 9m²', () => {
    for (const letter of ['B', 'C', 'D'] as const) {
      const row = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === letter);
      expect(row).toHaveLength(9);
      const col0 = row.find((s) => s.col === 0);
      expect(col0).toMatchObject({ taille_m2: 6, pole_recommended: 'DATA_ADTECH' });
      for (let c = 1; c <= 8; c++) {
        const stand = row.find((s) => s.col === c);
        expect(stand).toMatchObject({ taille_m2: 9, pole_recommended: 'AUDIO_RADIO' });
      }
    }
  });

  it('Rangée E : 11 stands (E0=OUTDOOR_DOOH, E1-E8=DIFFUSION_INFRA 9m², E9/E10=DIFFUSION_INFRA 6m²)', () => {
    const e = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === 'E');
    expect(e).toHaveLength(11);
    expect(e.find((s) => s.col === 0)).toMatchObject({
      taille_m2: 6,
      pole_recommended: 'OUTDOOR_DOOH',
    });
    expect(e.find((s) => s.col === 9)).toMatchObject({
      taille_m2: 6,
      pole_recommended: 'DIFFUSION_INFRA',
    });
    expect(e.find((s) => s.col === 10)).toMatchObject({
      taille_m2: 6,
      pole_recommended: 'DIFFUSION_INFRA',
    });
  });

  it('Rangées F/G : col 0 = OUTDOOR_DOOH, F=DIFFUSION_INFRA / G=VIDEO_CTV pour cols 1-8', () => {
    const f = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === 'F');
    expect(f).toHaveLength(9);
    expect(f.find((s) => s.col === 0)?.pole_recommended).toBe('OUTDOOR_DOOH');
    for (let c = 1; c <= 8; c++) {
      expect(f.find((s) => s.col === c)?.pole_recommended).toBe('DIFFUSION_INFRA');
    }
    const g = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === 'G');
    expect(g).toHaveLength(9);
    expect(g.find((s) => s.col === 0)?.pole_recommended).toBe('OUTDOOR_DOOH');
    for (let c = 1; c <= 8; c++) {
      expect(g.find((s) => s.col === c)?.pole_recommended).toBe('VIDEO_CTV');
    }
  });

  it('Rangée H : 4 stands isolés (H2, H3, H4 à 6m², H9 à 9m²) tous VIDEO_CTV', () => {
    const h = LE_NOTRE_PLAN_STANDS.filter((s) => s.letter === 'H');
    expect(h).toHaveLength(4);
    expect(h.map((s) => s.col).sort((a, b) => a - b)).toEqual([2, 3, 4, 9]);
    expect(h.every((s) => s.pole_recommended === 'VIDEO_CTV')).toBe(true);
    expect(h.find((s) => s.col === 9)?.taille_m2).toBe(9);
    for (const c of [2, 3, 4]) {
      expect(h.find((s) => s.col === c)?.taille_m2).toBe(6);
    }
  });

  it('numéros uniques (clé (salle, number) UNIQUE en DB)', () => {
    expect(LE_NOTRE_PLAN_NUMBERS.size).toBe(LE_NOTRE_PLAN_STANDS.length);
  });

  it('distribution par pôle correspond au plan Canva', () => {
    const byPole: Record<string, number> = {};
    for (const s of LE_NOTRE_PLAN_STANDS) {
      byPole[s.pole_recommended] = (byPole[s.pole_recommended] ?? 0) + 1;
    }
    expect(byPole).toEqual({
      AUDIO_RADIO: 33, // 9 (A) + 8 (B) + 8 (C) + 8 (D)
      DATA_ADTECH: 3, // B0, C0, D0
      DIFFUSION_INFRA: 18, // 10 (E hors E0) + 8 (F hors F0)
      OUTDOOR_DOOH: 3, // E0, F0, G0
      VIDEO_CTV: 12, // 8 (G hors G0) + 4 (H)
    });
  });
});
