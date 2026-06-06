/**
 * @vitest-environment node
 *
 * P5.x.ConnectOnAirContactsCache (V2) — tests parser XLSX deterministe
 * (mapping cells contact + dedup user_id + normalisation email).
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  mapRowToContactRow,
  parseContactsXlsx,
  normalizeEmailForMatching,
} from '../../../scripts/import-connectonair-contacts';

function buildRow(overrides: Record<number, unknown>): unknown[] {
  const row: unknown[] = new Array(79).fill(null);
  for (const [k, v] of Object.entries(overrides)) {
    row[Number(k)] = v;
  }
  return row;
}

function writeFixture(rows: unknown[][]): string {
  const header = new Array(79).fill('').map((_, i) => `col_${i}`);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-contacts-test-'));
  const filePath = path.join(tmpDir, 'fixture.xlsx');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('normalizeEmailForMatching (P5.x.ContactsCache V2)', () => {
  it('LOWER + TRIM symetrique', () => {
    expect(normalizeEmailForMatching('  Arnaud@PUBRADIO.FR  ')).toBe('arnaud@pubradio.fr');
    expect(normalizeEmailForMatching('arnaud@pubradio.fr')).toBe('arnaud@pubradio.fr');
  });
  it('null/undefined/empty/null-string -> null', () => {
    expect(normalizeEmailForMatching(null)).toBeNull();
    expect(normalizeEmailForMatching(undefined)).toBeNull();
    expect(normalizeEmailForMatching('')).toBeNull();
    expect(normalizeEmailForMatching('null')).toBeNull();
  });
  it('Filtre les emails sans @', () => {
    expect(normalizeEmailForMatching('pas-un-email')).toBeNull();
  });
});

describe('mapRowToContactRow (P5.x.ContactsCache V2)', () => {
  it('Mapping complet d une row contact CoA', () => {
    const row = buildRow({
      1: '42', // societe_id parent (col[1])
      48: 1, // site_id contact (toujours 1, on l ignore)
      49: 29067, // user_id (cle dedup)
      50: 'M', // genre
      51: 'Benassy', // nom -> last_name
      52: 'Arnaud', // prenom -> first_name
      60: 'France', // pays -> FR
      61: '+33147000000', // telephone -> phone
      62: '+33612345678', // mobil -> mobile
      64: 'Arnaud@Pubradio.FR', // mail
      65: 1, // mail_valide
      67: 'M.', // civilite
      68: 'fr', // langue
      69: 'unik-789', // unik_id
      70: 0, // rgpd false
      71: '2018-12-11 19:52:41', // date_create
      72: '2023-07-11 18:55:14', // date_update
      74: 'N', // send_in_blue
      75: 'https://linkedin.com/in/arnaud', // linkedin_id
      76: 'A notifier', // famille_fonction
      77: 'Responsable Radio', // fonction -> role
    });
    const r = mapRowToContactRow(row, 'batch-test');
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.source_user_id).toBe(29067);
    expect(r.source_unik_id).toBe('unik-789');
    expect(r.coa_societe_id).toBe('42'); // FK metier societe parent (col[1])
    expect(r.first_name).toBe('Arnaud');
    expect(r.last_name).toBe('Benassy');
    expect(r.email).toBe('Arnaud@Pubradio.FR');
    expect(r.email_normalized).toBe('arnaud@pubradio.fr'); // LOWER+TRIM
    expect(r.email_valid).toBe(true);
    expect(r.phone).toBe('+33147000000');
    expect(r.mobile).toBe('+33612345678');
    expect(r.role).toBe('Responsable Radio');
    expect(r.family_function).toBe('A notifier');
    expect(r.country).toBe('FR');
    expect(r.language).toBe('fr');
    expect(r.linkedin_url).toBe('https://linkedin.com/in/arnaud');
    expect(r.rgpd).toBe(false);
    expect(r.import_batch_id).toBe('batch-test');
    expect(r.source_created_at).toMatch(/^2018-12-11/);
    // raw_data contient toutes les cells non vides (48-78).
    expect(r.raw_data['49']).toBe(29067);
    expect(r.raw_data['64']).toBe('Arnaud@Pubradio.FR');
  });

  it('Skip row sans user_id (col[49])', () => {
    const row = buildRow({ 51: 'NoID' });
    expect(mapRowToContactRow(row, 'b')).toBeNull();
  });

  it('Email "NULL" string -> email + email_normalized null', () => {
    const row = buildRow({ 49: 1, 51: 'X', 64: 'NULL' });
    const r = mapRowToContactRow(row, 'b');
    expect(r?.email).toBeNull();
    expect(r?.email_normalized).toBeNull();
  });

  it('coa_societe_id pris sur col[1] (societe parent), PAS col[48] site_id', () => {
    const row = buildRow({
      1: 'SOC-42', // societe parent
      48: 1, // site_id (toujours 1, a ignorer)
      49: 100,
      51: 'X',
    });
    const r = mapRowToContactRow(row, 'b');
    expect(r?.coa_societe_id).toBe('SOC-42');
  });
});

describe('parseContactsXlsx — header sur rows[0] + dedup user_id', () => {
  it('Skip seul le header (rows[0]), pas double-skip', () => {
    const r1 = buildRow({ 1: 'S-1', 49: 100, 51: 'A', 52: 'Alice' });
    const r2 = buildRow({ 1: 'S-1', 49: 101, 51: 'B', 52: 'Bob' });
    const r3 = buildRow({ 1: 'S-2', 49: 100, 51: 'Dup' }); // user_id 100 deja vu -> skip
    const filePath = writeFixture([r1, r2, r3]);
    const { rows, stats } = parseContactsXlsx(filePath, 'b');
    expect(rows).toHaveLength(2);
    expect(stats.totalRows).toBe(3);
    expect(stats.uniqueUserIds).toBe(2);
    expect(stats.skippedDuplicates).toBe(1);
    expect(rows[0].first_name).toBe('Alice');
    expect(rows[1].first_name).toBe('Bob');
  });

  it('Stats withEmail / withLinkedin / withPhone', () => {
    const r1 = buildRow({ 49: 1, 51: 'X', 64: 'a@b.com', 75: 'https://lk/a' });
    const r2 = buildRow({ 49: 2, 51: 'Y', 61: '+33123' });
    const filePath = writeFixture([r1, r2]);
    const { stats } = parseContactsXlsx(filePath, 'b');
    expect(stats.withEmail).toBe(1);
    expect(stats.withEmailNormalized).toBe(1);
    expect(stats.withLinkedin).toBe(1);
    expect(stats.withPhone).toBe(1);
  });
});
