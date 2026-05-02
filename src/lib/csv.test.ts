import { describe, expect, it } from 'vitest';
import { csvCell, csvFileName, serializeCsv } from './csv';

describe('csvCell', () => {
  it('renvoie une chaine vide pour null/undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('echappe les valeurs avec virgules / quotes / newlines', () => {
    expect(csvCell('hello, world')).toBe('"hello, world"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('multi\nline')).toBe('"multi\nline"');
  });

  it('serialise number / boolean / Date proprement', () => {
    expect(csvCell(42)).toBe('42');
    expect(csvCell(true)).toBe('true');
    const d = new Date('2026-05-02T12:00:00Z');
    expect(csvCell(d)).toBe('2026-05-02T12:00:00.000Z');
  });
});

describe('serializeCsv', () => {
  it('produit un CSV avec header + lignes', () => {
    const rows = [
      { name: 'NRJ', domain: 'nrj.fr', amount: 5975 },
      { name: 'Radio, Inc.', domain: null, amount: null },
    ];
    const csv = serializeCsv(
      [
        { key: 'name', label: 'Societe' },
        { key: 'domain', label: 'Domaine' },
        { key: 'amount', label: 'Montant HT' },
      ],
      rows,
    );
    expect(csv).toBe('Societe,Domaine,Montant HT\r\nNRJ,nrj.fr,5975\r\n"Radio, Inc.",,\r\n');
  });
});

describe('csvFileName', () => {
  it('formate avec date YYYY-MM-DD', () => {
    expect(csvFileName('prospects-export', new Date('2026-05-02T03:00:00Z'))).toMatch(
      /^prospects-export-2026-05-0[12]\.csv$/,
    );
  });
});
