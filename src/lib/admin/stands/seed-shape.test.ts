/**
 * @vitest-environment node
 *
 * P6.x.2a / P6.x.2a-bis — tests pure de la forme des seeds.
 */

import { describe, it, expect } from 'vitest';
import { buildLeNotreFlatSeeds, buildLeNotreGridSeeds } from './seeds';

describe('buildLeNotreFlatSeeds — legacy V1 (P6.x.2a)', () => {
  const seeds = buildLeNotreFlatSeeds();

  it('produit exactement 69 stands L01..L69 (15 × 6m² + 54 × 9m²)', () => {
    expect(seeds).toHaveLength(69);
    expect(seeds.filter((s) => s.taille_m2 === 6).length).toBe(15);
    expect(seeds.filter((s) => s.taille_m2 === 9).length).toBe(54);
  });

  it('tous Le Nôtre, status=libre, pole_recommended=null (legacy)', () => {
    for (const s of seeds) {
      expect(s.salle).toBe('le_notre');
      expect(s.status).toBe('libre');
      expect(s.pole_recommended).toBeNull();
    }
  });
});

describe('buildLeNotreGridSeeds — V2 grille 8×11 (P6.x.2a-bis)', () => {
  const seeds = buildLeNotreGridSeeds();

  it('produit exactement 88 stands (A-H × 0-10)', () => {
    expect(seeds).toHaveLength(88);
  });

  it('couvre toute la grille A0..H10 avec numéros uniques', () => {
    const numbers = new Set(seeds.map((s) => s.number));
    expect(numbers.size).toBe(88);
    // Échantillonage des coins de la grille
    expect(numbers.has('A0')).toBe(true);
    expect(numbers.has('A10')).toBe(true);
    expect(numbers.has('H0')).toBe(true);
    expect(numbers.has('H10')).toBe(true);
    expect(numbers.has('D5')).toBe(true);
  });

  it('taille : rangée A et colonne 10 = 6 m², le reste = 9 m²', () => {
    for (const s of seeds) {
      const letter = s.number[0];
      const col = Number(s.number.slice(1));
      const expectedSize = letter === 'A' || col === 10 ? 6.0 : 9.0;
      expect(s.taille_m2).toBe(expectedSize);
    }
    // Count : row A (11 stands) + col 10 (8 stands) - intersection A10 (1) = 18 stands à 6m²
    expect(seeds.filter((s) => s.taille_m2 === 6).length).toBe(18);
    expect(seeds.filter((s) => s.taille_m2 === 9).length).toBe(70);
  });

  it('pôle par rangée : A-D = AUDIO_RADIO, E-F = DIFFUSION_INFRA, G-H = VIDEO_CTV (col 0-9)', () => {
    const audio = seeds.filter(
      (s) => ['A', 'B', 'C', 'D'].includes(s.number[0]) && Number(s.number.slice(1)) !== 10,
    );
    expect(audio.length).toBe(40); // 4 rows × 10 cols
    for (const s of audio) expect(s.pole_recommended).toBe('AUDIO_RADIO');

    const diff = seeds.filter(
      (s) => ['E', 'F'].includes(s.number[0]) && Number(s.number.slice(1)) !== 10,
    );
    expect(diff.length).toBe(20);
    for (const s of diff) expect(s.pole_recommended).toBe('DIFFUSION_INFRA');

    const video = seeds.filter(
      (s) => ['G', 'H'].includes(s.number[0]) && Number(s.number.slice(1)) !== 10,
    );
    expect(video.length).toBe(20);
    for (const s of video) expect(s.pole_recommended).toBe('VIDEO_CTV');
  });

  it('override colonne 10 : A-D = DATA_ADTECH (4 stands), E-H = OUTDOOR_DOOH (4 stands)', () => {
    const dataAdtech = seeds.filter(
      (s) => s.number.endsWith('10') && ['A', 'B', 'C', 'D'].includes(s.number[0]),
    );
    expect(dataAdtech.length).toBe(4);
    for (const s of dataAdtech) expect(s.pole_recommended).toBe('DATA_ADTECH');

    const outdoor = seeds.filter(
      (s) => s.number.endsWith('10') && ['E', 'F', 'G', 'H'].includes(s.number[0]),
    );
    expect(outdoor.length).toBe(4);
    for (const s of outdoor) expect(s.pole_recommended).toBe('OUTDOOR_DOOH');
  });

  it('tous salle=le_notre, status=libre', () => {
    for (const s of seeds) {
      expect(s.salle).toBe('le_notre');
      expect(s.status).toBe('libre');
    }
  });
});

describe('STATUS_COLOR (P6.x.2a-bis colors)', () => {
  it('reserve = orange, paye = rouge (doctrine plan Canva)', async () => {
    const mod =
      await import('../../../app/admin/(authenticated)/emplacements/_components/EmplacementsClient');
    expect(mod.STATUS_COLOR.libre.ring).toMatch(/emerald/);
    expect(mod.STATUS_COLOR.reserve.ring).toMatch(/orange/);
    expect(mod.STATUS_COLOR.paye.ring).toMatch(/red/);
    expect(mod.STATUS_COLOR.bloque.ring).toMatch(/slate/);
  });
});
