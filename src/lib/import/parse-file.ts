/**
 * Parser CSV / xlsx pour l'import companies.
 * Cote serveur uniquement (server actions). On retourne des rows
 * Record<string, string> avec les headers comme cles.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type FileFormat = 'csv' | 'xlsx';

export function detectFormat(fileName: string): FileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  return null;
}

export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error('Format non supporte. Utilise .csv, .xlsx ou .xls.');
  }

  if (format === 'csv') {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new Error(`CSV invalide : ${parsed.errors[0]?.message ?? 'inconnu'}`);
    }
    const headers = parsed.meta.fields ?? [];
    const rows = parsed.data
      .map((r) => normalizeRow(r))
      .filter((r) => Object.values(r).some((v) => v.length > 0));
    return { fileName: file.name, headers, rows };
  }

  // xlsx / xls
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Le fichier ne contient aucune feuille.');
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (matrix.length < 2) {
    throw new Error('Le fichier ne contient pas de donnees (header + au moins 1 ligne attendu).');
  }
  const rawHeaders = (matrix[0] ?? []).map((h) => String(h ?? '').trim());
  const headers = dedupeHeaders(rawHeaders);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      const cell = matrix[i]?.[j];
      row[headers[j]] = cell === null || cell === undefined ? '' : String(cell).trim();
    }
    if (Object.values(row).some((v) => v.length > 0)) {
      rows.push(row);
    }
  }
  return { fileName: file.name, headers, rows };
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }
  return out;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = h || '_unnamed';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}
