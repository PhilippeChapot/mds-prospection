/**
 * P5.x.17 — sanity tests sur la config navigation Espace Exposant V1.3.
 *
 * Garanties testees :
 *   - 5 sections (cf brief)
 *   - segments uniques (eviter de mapper 2 items sur la meme URL)
 *   - DEFAULT_EXPOSANT_SECTION pointe sur un segment connu
 *   - chaque labelKey est unique (pour eviter une cle i18n manquante
 *     ou un copier-coller)
 */

import { describe, it, expect } from 'vitest';
import { EXPOSANT_NAV_ITEMS, DEFAULT_EXPOSANT_SECTION } from './nav-items';

describe('EXPOSANT_NAV_ITEMS (P5.x.17)', () => {
  it('expose exactement 5 sections', () => {
    expect(EXPOSANT_NAV_ITEMS).toHaveLength(5);
  });

  it('chaque segment est unique', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it('chaque labelKey est unique', () => {
    const keys = EXPOSANT_NAV_ITEMS.map((i) => i.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('expose stand / coordonnees / documents / kit-communication / invitations', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment).sort();
    expect(segments).toEqual([
      'coordonnees',
      'documents',
      'invitations',
      'kit-communication',
      'stand',
    ]);
  });

  it('DEFAULT_EXPOSANT_SECTION pointe sur un segment connu', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment);
    expect(segments).toContain(DEFAULT_EXPOSANT_SECTION);
  });

  it('chaque item a un emoji non vide', () => {
    for (const item of EXPOSANT_NAV_ITEMS) {
      expect(item.emoji.length).toBeGreaterThan(0);
    }
  });
});
