/**
 * P5.x.ExternalEvents — tests adapter SATIS.
 */

import { describe, it, expect } from 'vitest';
import { parseSatisRows } from './satis';

describe('parseSatisRows', () => {
  it('produit enrichment complet (website, address, linkedin, secteur)', () => {
    const rows = [
      {
        Nom: 'Adobe',
        Salon: 'SATIS',
        Stand: 'E14',
        Profil: 'Fabricant',
        Secteurs: 'Logiciels',
        Description: 'Editeur',
        'Site Web': 'http://www.adobe.com',
        Téléphone: '0123456789',
        Email: '',
        Adresse: '94 rue Laurison',
        'Code Postal': '75116',
        Ville: 'PARIS',
        Pays: 'France',
        LinkedIn: 'https://linkedin.com/adobe',
        Facebook: '',
        Instagram: '',
        YouTube: '',
      },
    ];
    const out = parseSatisRows(rows);
    expect(out.source).toBe('satis');
    expect(out.companies).toHaveLength(1);
    const c = out.companies[0];
    expect(c.eventKey).toBe('satis');
    expect(c.years).toEqual([2025]);
    expect(c.enrichment?.website).toBe('http://www.adobe.com');
    expect(c.enrichment?.linkedin).toBe('https://linkedin.com/adobe');
    expect(c.enrichment?.address).toBe('94 rue Laurison');
    expect(c.enrichment?.sector).toBe('Logiciels');
  });

  it('contact email verified (donnees publiques)', () => {
    const rows = [
      {
        Nom: 'Foo',
        Email: 'dpo@foo.fr',
        Téléphone: '0123',
      },
    ];
    const out = parseSatisRows(rows);
    expect(out.companies[0].contacts).toHaveLength(1);
    expect(out.companies[0].contacts[0].emailConfidence).toBe('verified');
    expect(out.companies[0].contacts[0].email).toBe('dpo@foo.fr');
  });

  it('skip ligne sans Nom', () => {
    const rows = [{ Nom: null, Email: 'x@y.fr' }];
    const out = parseSatisRows(rows);
    expect(out.companies).toHaveLength(0);
  });
});
