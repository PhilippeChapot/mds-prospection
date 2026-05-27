/**
 * P5.x.17 — sanity tests sur la config navigation Espace Exposant.
 * P6.x.1b — étendu à 6 sections (ajout 'commander').
 * P3.1   — étendu à 8 sections (ajout 'ressources').
 * P9.2   — étendu à 9 sections (ajout 'messages').
 *
 * Garanties testees :
 *   - 9 sections
 *   - segments uniques (eviter de mapper 2 items sur la meme URL)
 *   - DEFAULT_EXPOSANT_SECTION pointe sur un segment connu
 *   - chaque labelKey est unique
 */

import { describe, it, expect } from 'vitest';
import { EXPOSANT_NAV_ITEMS, DEFAULT_EXPOSANT_SECTION } from './nav-items';

describe('EXPOSANT_NAV_ITEMS', () => {
  it('expose 9 sections (base + commander/commandes + ressources P3.1 + messages P9.2)', () => {
    expect(EXPOSANT_NAV_ITEMS).toHaveLength(9);
  });

  it('chaque segment est unique', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it('chaque labelKey est unique', () => {
    const keys = EXPOSANT_NAV_ITEMS.map((i) => i.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('expose stand / coordonnees / documents / kit-communication / invitations / commander / commandes / ressources / messages', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment).sort();
    expect(segments).toEqual([
      'commander',
      'commandes',
      'coordonnees',
      'documents',
      'invitations',
      'kit-communication',
      'messages',
      'ressources',
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
