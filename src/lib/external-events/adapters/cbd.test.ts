/**
 * P5.x.ExternalEvents — tests adapter CBD.
 */

import { describe, it, expect } from 'vitest';
import { parseCbdRows } from './cbd';

describe('parseCbdRows', () => {
  const COL_COMPANY =
    '1. Nom de la société (Company name)\n(Nom exact tel qu’il doit apparaître dans la communication officielle)';
  const COL_PERSON =
    '5. Nom de la personne présente sur le stand (Name of the person at the booth) 👤 :';
  const COL_EMAIL = 'Adresse e-mail';

  it('contacts emailConfidence=medium (formulaire)', () => {
    const rows = [
      {
        [COL_COMPANY]: 'AJA Video Systems',
        [COL_PERSON]: 'Andy Bellamy',
        [COL_EMAIL]: 'andy@aja.com',
      },
    ];
    const out = parseCbdRows(rows);
    expect(out.source).toBe('cbd');
    expect(out.companies).toHaveLength(1);
    expect(out.companies[0].contacts[0].emailConfidence).toBe('medium');
    expect(out.companies[0].years).toEqual([2025]);
  });

  it('regroupe 2 personnes meme societe', () => {
    const rows = [
      {
        [COL_COMPANY]: 'Foo',
        [COL_PERSON]: 'A',
        [COL_EMAIL]: 'a@foo.com',
      },
      {
        [COL_COMPANY]: 'Foo',
        [COL_PERSON]: 'B',
        [COL_EMAIL]: 'b@foo.com',
      },
    ];
    const out = parseCbdRows(rows);
    expect(out.companies).toHaveLength(1);
    expect(out.companies[0].contacts).toHaveLength(2);
  });

  it('skip lignes sans company name', () => {
    const rows = [
      {
        [COL_COMPANY]: null,
        [COL_PERSON]: 'Empty',
        [COL_EMAIL]: 'x@y.com',
      },
    ];
    const out = parseCbdRows(rows);
    expect(out.companies).toHaveLength(0);
  });
});
