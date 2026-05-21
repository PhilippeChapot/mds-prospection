/**
 * @vitest-environment node
 *
 * P6.x.3 — tests calcul approximatif des positions overlay plan Canva.
 */

import { describe, it, expect } from 'vitest';
import { calculateApproxPosition } from './seeds';

describe('calculateApproxPosition (P6.x.3)', () => {
  it('toutes les positions sont dans les bornes 0-100', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const) {
      for (let col = 0; col <= 10; col++) {
        const p = calculateApproxPosition(letter, col);
        expect(p.position_x).toBeGreaterThanOrEqual(0);
        expect(p.position_x).toBeLessThanOrEqual(100);
        expect(p.position_y).toBeGreaterThanOrEqual(0);
        expect(p.position_y).toBeLessThanOrEqual(100);
        expect(p.position_w).toBeGreaterThan(0);
        expect(p.position_w).toBeLessThanOrEqual(100);
        expect(p.position_h).toBeGreaterThan(0);
        expect(p.position_h).toBeLessThanOrEqual(100);
      }
    }
  });

  it('A0 (haut-gauche au sens row=A col=0 affiché à droite) → x élevé, y faible', () => {
    const p = calculateApproxPosition('A', 0);
    // col 0 = droite du plan -> x proche de la marge droite (≈ 22 + 10*6.818 = 90)
    expect(p.position_x).toBeGreaterThan(80);
    // rangée A = haut -> y == marge top
    expect(p.position_y).toBe(12);
  });

  it('A10 → x au minimum (côté scènes), même y que A0', () => {
    const a0 = calculateApproxPosition('A', 0);
    const a10 = calculateApproxPosition('A', 10);
    // col 10 = gauche du plan -> x == marge gauche (22)
    expect(a10.position_x).toBe(22);
    expect(a10.position_y).toBe(a0.position_y);
  });

  it('H vs A : différence de 7 cell_height en y (8 rangées au total)', () => {
    const a = calculateApproxPosition('A', 5);
    const h = calculateApproxPosition('H', 5);
    // (100 - 12 - 8) / 8 = 10 par rangée ; 7 rangées entre A et H = 70
    expect(h.position_y - a.position_y).toBeCloseTo(70, 1);
    // x identique pour la même colonne
    expect(h.position_x).toBeCloseTo(a.position_x, 5);
  });
});
