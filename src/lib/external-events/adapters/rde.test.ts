/**
 * P5.x.ExternalEvents — tests adapter RDE.
 */

import { describe, it, expect } from 'vitest';
import { parseRdeRows } from './rde';

describe('parseRdeRows', () => {
  it('regroupe N contacts d une meme societe', () => {
    const rows = [
      {
        Société: 'AdsWizz',
        'Nom complet': 'Frank K',
        Fonction: 'Head of DACH',
        Email: 'frank@adswizz.com',
        Confiance: 'Moyenne',
      },
      {
        Société: 'AdsWizz',
        'Nom complet': 'Paul B',
        Fonction: 'VP Europe',
        Email: 'paul@adswizz.com',
        Confiance: 'Haute',
      },
    ];
    const out = parseRdeRows(rows);
    expect(out.source).toBe('rde');
    expect(out.companies).toHaveLength(1);
    expect(out.companies[0].normalizedName).toBe('adswizz');
    expect(out.companies[0].years).toEqual([2026]);
    expect(out.companies[0].contacts).toHaveLength(2);
  });

  it('TOUS les contacts ont emailConfidence=low (emails deduits)', () => {
    const rows = [
      {
        Société: 'Foo',
        'Nom complet': 'A B',
        Email: 'a@foo.com',
        Confiance: 'Haute',
      },
    ];
    const out = parseRdeRows(rows);
    expect(out.companies[0].contacts[0].emailConfidence).toBe('low');
  });

  it('eventKey=rde + years=[2026]', () => {
    const out = parseRdeRows([{ Société: 'X', 'Nom complet': 'Y', Email: 'y@x.com' }]);
    expect(out.companies[0].eventKey).toBe('rde');
    expect(out.companies[0].years).toEqual([2026]);
  });
});
