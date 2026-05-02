/**
 * Serialisation CSV minimaliste compatible RFC 4180.
 * - Echappe les valeurs contenant `,` `"` `\n` ou `\r` en les entourant de "
 * - Double les `"` internes
 * - Joint les lignes avec \r\n (compat Excel)
 *
 * Garde le code volontairement testable et sans dependance.
 */

export type CsvValue = string | number | boolean | null | undefined | Date;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const str =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'boolean'
        ? value
          ? 'true'
          : 'false'
        : String(value);
  if (str === '') return '';
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function csvLine(cells: CsvValue[]): string {
  return cells.map(csvCell).join(',');
}

export function serializeCsv<T extends Record<string, CsvValue>>(
  headers: { key: keyof T; label: string }[],
  rows: T[],
): string {
  const headerLine = csvLine(headers.map((h) => h.label));
  const dataLines = rows.map((row) => csvLine(headers.map((h) => row[h.key])));
  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

/**
 * Filename safe : prefix-YYYY-MM-DD.csv
 */
export function csvFileName(prefix: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}-${m}-${d}.csv`;
}
