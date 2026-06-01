/**
 * P5.x.ExternalEvents — adapter MD Classic (Havas).
 *
 * Source : MD PROSPECTION/LISTING_EXPOSANTS_MD2023-2026/MEDIADAYS 2026.xlsx
 * Format : 2 colonnes SOCIETE + ANNEES MEDIADAYS.
 *   "ANNEES MEDIADAYS" peut etre une chaine type "MEDIADAYS 2025" ou
 *   "MEDIADAYS 2023, 2024" (une seule cellule). On extrait toutes les
 *   annees au format 20XX.
 *
 * Plusieurs lignes peuvent referer la meme societe -> on agrege les
 * annees par normalizedName.
 *
 * Pas de contacts dans cette source.
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { normalizeCompanyName, parseYearsFromCell } from '../normalize';
import type { NormalizedImport, ImportedCompany } from '../types';

interface RawRow {
  SOCIETE?: unknown;
  'ANNEES MEDIADAYS'?: unknown;
}

export function parseMdClassicWorkbook(buf: Buffer): NormalizedImport {
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
  return parseMdClassicRows(rows);
}

export function parseMdClassicRows(rows: RawRow[]): NormalizedImport {
  const byKey = new Map<string, ImportedCompany>();

  for (const row of rows) {
    const rawName = String(row.SOCIETE ?? '').trim();
    if (!rawName || /^\d+$/.test(rawName)) continue;
    const normalizedName = normalizeCompanyName(rawName);
    if (!normalizedName) continue;

    const yearsCell = String(row['ANNEES MEDIADAYS'] ?? '');
    const years = parseYearsFromCell(yearsCell, { minYear: 2023, maxYear: 2026 });
    if (years.length === 0) continue;

    const existing = byKey.get(normalizedName);
    if (existing) {
      const merged = Array.from(new Set([...existing.years, ...years])).sort((a, b) => a - b);
      existing.years = merged;
    } else {
      byKey.set(normalizedName, {
        rawName,
        normalizedName,
        eventKey: 'mediadays_classic',
        years,
        contacts: [],
      });
    }
  }

  return {
    source: 'md_classic',
    companies: Array.from(byKey.values()),
  };
}

export function readMdClassicFile(filePath: string): NormalizedImport {
  return parseMdClassicWorkbook(readFileSync(filePath));
}
