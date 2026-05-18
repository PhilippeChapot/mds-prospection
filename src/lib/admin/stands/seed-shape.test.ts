/**
 * @vitest-environment node
 *
 * P6.x.2a — test pure de la forme du seed Le Nôtre.
 *
 * Vérifie que buildLeNotreSeeds() produit bien 69 stands avec la bonne
 * répartition (15 × 6m² + 54 × 9m²), sans dépendance DB.
 */

import { describe, it, expect } from 'vitest';
import { buildLeNotreSeeds } from './seeds';

describe('buildLeNotreSeeds (P6.x.2a)', () => {
  const seeds = buildLeNotreSeeds();

  it('produit exactement 69 stands', () => {
    expect(seeds).toHaveLength(69);
  });

  it('15 stands à 6.0 m² (L01..L15)', () => {
    const six = seeds.filter((s) => s.taille_m2 === 6.0);
    expect(six).toHaveLength(15);
    expect(six[0].number).toBe('L01');
    expect(six[14].number).toBe('L15');
  });

  it('54 stands à 9.0 m² (L16..L69)', () => {
    const nine = seeds.filter((s) => s.taille_m2 === 9.0);
    expect(nine).toHaveLength(54);
    expect(nine[0].number).toBe('L16');
    expect(nine[53].number).toBe('L69');
  });

  it('tous Le Nôtre, status=libre, pole_recommended=null', () => {
    for (const s of seeds) {
      expect(s.salle).toBe('le_notre');
      expect(s.status).toBe('libre');
      expect(s.pole_recommended).toBeNull();
    }
  });

  it('numbers uniques (idempotence du seed sur unique (salle, number))', () => {
    const numbers = new Set(seeds.map((s) => s.number));
    expect(numbers.size).toBe(seeds.length);
  });
});
