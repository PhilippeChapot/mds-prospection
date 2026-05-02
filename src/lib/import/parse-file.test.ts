import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { detectFormat, parseUploadedFile } from './parse-file';

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectFormat', () => {
  it('detecte les extensions supportees', () => {
    expect(detectFormat('foo.csv')).toBe('csv');
    expect(detectFormat('FOO.XLSX')).toBe('xlsx');
    expect(detectFormat('legacy.xls')).toBe('xlsx');
    expect(detectFormat('data.txt')).toBe('csv');
  });
  it('renvoie null pour les formats non supportes', () => {
    expect(detectFormat('foo.json')).toBeNull();
    expect(detectFormat('foo')).toBeNull();
  });
});

describe('parseUploadedFile (CSV)', () => {
  it('parse un CSV simple avec headers', async () => {
    const csv = [
      'name,primary_domain,country,pole_code',
      'NRJ Group,nrj.fr,FR,AUDIO_RADIO',
      'Radio France,radiofrance.com,FR,AUDIO_RADIO',
      'BBC Studios,bbc.co.uk,GB,VIDEO_CTV',
    ].join('\n');
    const parsed = await parseUploadedFile(csvFile('seed.csv', csv));
    expect(parsed.fileName).toBe('seed.csv');
    expect(parsed.headers).toEqual(['name', 'primary_domain', 'country', 'pole_code']);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toEqual({
      name: 'NRJ Group',
      primary_domain: 'nrj.fr',
      country: 'FR',
      pole_code: 'AUDIO_RADIO',
    });
    expect(parsed.rows[2].country).toBe('GB');
  });

  it('skippe les lignes entierement vides', async () => {
    const csv = ['name,domain', 'A,a.com', ',', 'B,b.com'].join('\n');
    const parsed = await parseUploadedFile(csvFile('partial.csv', csv));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('throw sur format non supporte', async () => {
    await expect(
      parseUploadedFile(new File(['{}'], 'data.json', { type: 'application/json' })),
    ).rejects.toThrow(/Format non supporte/);
  });
});

describe('parseUploadedFile (XLSX)', () => {
  it('parse un xlsx genere en memoire', async () => {
    const data = [
      ['name', 'primary_domain', 'pole_code'],
      ['Foo Studios', 'foo.com', 'AUDIO_RADIO'],
      ['Bar Media', 'bar.fr', 'DATA_ADTECH'],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Companies');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const parsed = await parseUploadedFile(file);
    expect(parsed.headers).toEqual(['name', 'primary_domain', 'pole_code']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]).toEqual({
      name: 'Bar Media',
      primary_domain: 'bar.fr',
      pole_code: 'DATA_ADTECH',
    });
  });
});
