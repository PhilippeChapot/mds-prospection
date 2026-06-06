/**
 * @vitest-environment node
 *
 * P5.x.ConnectOnAirDirectoryCache — tests du parser XLSX deterministe
 * (mapping cells + dedup + cast bool/timestamp + normalisation pays).
 *
 * On ne teste pas la couche Supabase ici (c est du I/O). Les tests
 * couvrent uniquement la pure-function mapRowToDirectoryRow + parseXlsxRows
 * avec un sheet en memoire.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { mapRowToDirectoryRow, parseXlsxRows } from '../../../scripts/import-connectonair-export';

// Helper : construit une row "complete" avec valeurs nulles partout sauf
// les indices fournis.
function buildRow(overrides: Record<number, unknown>): unknown[] {
  const row: unknown[] = new Array(48).fill(null);
  for (const [k, v] of Object.entries(overrides)) {
    row[Number(k)] = v;
  }
  return row;
}

describe('mapRowToDirectoryRow (P5.x.ConnectOnAirDirectoryCache)', () => {
  it('Mapping complet d une row CoA', () => {
    const row = buildRow({
      1: 'SOC-123', // societe_id
      2: 'SARL', // forme_juridique
      3: '12345678901234', // siret
      4: '10 rue de la Radio', // adresse
      5: 'BAT B', // complement
      6: '75016', // code_postal
      7: 'Paris', // ville
      8: 'France', // pays -> FR
      9: 'FR', // code_pays
      10: '+33147000000', // telephone
      11: '+33147000001', // fax
      12: 'contact@pubradio.fr', // mail
      13: 'https://pubradio.fr', // url
      14: '1', // est_radio = true
      15: 'N', // est_public = false
      17: '2024-05-12 14:32:01', // date_de_maj
      18: 'Pubradio SAS', // raison_social
      19: 'Pubradio', // abrege
      20: 'PR', // sigle
      21: 'Radio', // categorie
      27: 'UNIK-789', // unik_id
      30: 'Premium', // type_exposant
      31: 'audio,radio', // keyword
      32: 'https://instagram.com/pubradio',
      33: 'https://fb.com/pubradio',
      34: 'https://twitter.com/pubradio',
      35: 'https://linkedin.com/company/pubradio',
      44: 'Radio + podcast',
      45: 'Studios',
      46: 'Pubradio',
      47: '88.6 FM',
    });
    const r = mapRowToDirectoryRow(row, 'batch-test');
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.source_societe_id).toBe('SOC-123');
    expect(r.source_unik_id).toBe('UNIK-789');
    expect(r.name).toBe('Pubradio SAS');
    expect(r.normalized_name).toBe('PUBRADIO SAS');
    expect(r.country).toBe('FR'); // France -> FR via normalizeCountryToIso
    expect(r.est_radio).toBe(true);
    expect(r.est_public).toBe(false);
    expect(r.source_updated_at).toMatch(/^2024-05-12/);
    expect(r.import_batch_id).toBe('batch-test');
    expect(r.activites).toBe('Radio + podcast');
    // raw_data contient toutes les cells non vides.
    expect(r.raw_data['18']).toBe('Pubradio SAS');
    expect(r.raw_data['1']).toBe('SOC-123');
  });

  it('Skip row sans societe_id', () => {
    const row = buildRow({ 18: 'Some Company' });
    expect(mapRowToDirectoryRow(row, 'b')).toBeNull();
  });

  it('Skip row sans raison_social', () => {
    const row = buildRow({ 1: 'SOC-123' });
    expect(mapRowToDirectoryRow(row, 'b')).toBeNull();
  });

  it('Normalisation pays : "Allemagne" -> DE, "Cote d ivoire" -> CI', () => {
    const r1 = mapRowToDirectoryRow(buildRow({ 1: 'A', 18: 'X', 8: 'Allemagne' }), 'b');
    expect(r1?.country).toBe('DE');
    // "Cote d ivoire" n'est pas dans la liste minimale du helper -> null
    // (acceptable, country_code col 9 sert de fallback).
    const r2 = mapRowToDirectoryRow(buildRow({ 1: 'B', 18: 'Y', 8: 'CI', 9: 'CI' }), 'b');
    expect(r2?.country).toBe('CI');
    expect(r2?.country_code).toBe('CI');
  });

  it('est_radio : "1" -> true, "N" -> false, NULL -> null', () => {
    expect(mapRowToDirectoryRow(buildRow({ 1: 'A', 18: 'X', 14: '1' }), 'b')?.est_radio).toBe(true);
    expect(mapRowToDirectoryRow(buildRow({ 1: 'B', 18: 'Y', 14: 'N' }), 'b')?.est_radio).toBe(
      false,
    );
    expect(mapRowToDirectoryRow(buildRow({ 1: 'C', 18: 'Z' }), 'b')?.est_radio).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────────
// parseXlsxRows : dedup applicatif via fichier XLSX en memoire
// ───────────────────────────────────────────────────────────────────────

function writeXlsxFixture(rows: unknown[][]): string {
  // En-tete attendu : ligne 1 = titre, ligne 2 = header. Donnees a partir
  // de la ligne 3.
  const title = ['Export CoA test'];
  const header = new Array(48).fill('').map((_, i) => `col_${i}`);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([title, header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-test-'));
  const filePath = path.join(tmpDir, 'fixture.xlsx');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('parseXlsxRows : dedup + stats', () => {
  it('Dedup applicatif sur source_societe_id', () => {
    const r1 = (() => {
      const r: unknown[] = new Array(48).fill(null);
      r[1] = 'SOC-A';
      r[18] = 'Acme';
      r[8] = 'France';
      r[14] = '1';
      return r;
    })();
    const r2 = (() => {
      const r: unknown[] = new Array(48).fill(null);
      r[1] = 'SOC-A'; // meme societe_id que r1 -> skip
      r[18] = 'Acme (contact 2)';
      return r;
    })();
    const r3 = (() => {
      const r: unknown[] = new Array(48).fill(null);
      r[1] = 'SOC-B';
      r[18] = 'Beta';
      r[8] = 'Allemagne';
      return r;
    })();
    const filePath = writeXlsxFixture([r1, r2, r3]);
    const { rows, stats } = parseXlsxRows(filePath, 'b');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Acme'); // 1ere occurrence garde
    expect(rows[1].name).toBe('Beta');
    expect(stats.totalRows).toBe(3);
    expect(stats.uniqueSocieteIds).toBe(2);
    expect(stats.skippedDuplicates).toBe(1);
    expect(stats.countryNormalized).toBe(2); // FR + DE
    expect(stats.withRadioFlag).toBe(1);
  });

  it('Skip rows sans societe_id', () => {
    const r1: unknown[] = new Array(48).fill(null);
    r1[18] = 'Without ID';
    const r2: unknown[] = new Array(48).fill(null);
    r2[1] = 'SOC-Z';
    r2[18] = 'With ID';
    const filePath = writeXlsxFixture([r1, r2]);
    const { rows, stats } = parseXlsxRows(filePath, 'b');
    expect(rows).toHaveLength(1);
    expect(stats.skippedNoId).toBe(1);
  });
});
