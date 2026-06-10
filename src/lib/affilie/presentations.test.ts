/**
 * P7.x.AffiliateCanvaPresentations — tests config statique.
 *
 * Couvre :
 *   - locale=fr → retourne cards FR + card commune
 *   - locale=en → retourne cards EN + card commune (pas les cards FR)
 */

import { describe, it, expect } from 'vitest';
import { getPresentations } from './presentations';

describe('getPresentations (P7.x)', () => {
  it('locale=fr retourne les cards FR + la card commune', () => {
    const items = getPresentations('fr');
    const ids = items.map((i) => i.id);
    expect(ids).toContain('fr-with-rates');
    expect(ids).toContain('fr-without-rates');
    expect(ids).toContain('common-floor-plans');
    // Pas de card EN
    expect(ids).not.toContain('en-with-rates');
    expect(ids).not.toContain('en-without-rates');
  });

  it('locale=en retourne les cards EN + la card commune (pas les cards FR)', () => {
    const items = getPresentations('en');
    const ids = items.map((i) => i.id);
    expect(ids).toContain('en-with-rates');
    expect(ids).toContain('en-without-rates');
    expect(ids).toContain('common-floor-plans');
    // Pas de card FR
    expect(ids).not.toContain('fr-with-rates');
    expect(ids).not.toContain('fr-without-rates');
  });
});
