/**
 * P5.x.ExternalEvents — tests adapter MD Classic.
 */

import { describe, it, expect } from 'vitest';
import { parseMdClassicRows } from './md-classic';

describe('parseMdClassicRows', () => {
  it('dedup + concat années (Canal+ sur 3 éditions)', () => {
    const rows = [
      { SOCIETE: 'Canal+', 'ANNEES MEDIADAYS': 'MEDIADAYS 2023' },
      { SOCIETE: 'Canal+', 'ANNEES MEDIADAYS': 'MEDIADAYS 2024' },
      { SOCIETE: 'Canal+', 'ANNEES MEDIADAYS': 'MEDIADAYS 2026' },
    ];
    const out = parseMdClassicRows(rows);
    expect(out.source).toBe('md_classic');
    expect(out.companies).toHaveLength(1);
    expect(out.companies[0].normalizedName).toBe('canal+');
    expect(out.companies[0].years).toEqual([2023, 2024, 2026]);
    expect(out.companies[0].eventKey).toBe('mediadays_classic');
  });

  it('multiple years dans une seule cellule', () => {
    const rows = [{ SOCIETE: 'TF1 Pub', 'ANNEES MEDIADAYS': '2024, 2025, 2026' }];
    const out = parseMdClassicRows(rows);
    expect(out.companies[0].years).toEqual([2024, 2025, 2026]);
  });

  it('skip rows with no year', () => {
    const rows = [
      { SOCIETE: 'Foo', 'ANNEES MEDIADAYS': 'inconnu' },
      { SOCIETE: 'Bar', 'ANNEES MEDIADAYS': null },
    ];
    const out = parseMdClassicRows(rows);
    expect(out.companies).toHaveLength(0);
  });

  it('skip numeric SOCIETE (header noise)', () => {
    const rows = [{ SOCIETE: 366, 'ANNEES MEDIADAYS': 'MEDIADAYS 2025' }];
    const out = parseMdClassicRows(rows);
    expect(out.companies).toHaveLength(0);
  });
});
