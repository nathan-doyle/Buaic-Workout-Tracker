/**
 * CSV text (RFC 4180) for spreadsheets.
 *
 * - Fields are separated by commas and records end with CRLF (the last one too).
 * - A field holding a comma, a double quote, CR or LF is wrapped in double quotes,
 *   and every double quote inside it is doubled.
 * - Numbers are written with a dot as the decimal separator, whatever the locale.
 * - Text that a spreadsheet would read as a formula (starting with `=`, `+`, `-`,
 *   `@`, tab or CR) gets a leading apostrophe, so a note like "-2 kg next time"
 *   stays text instead of turning into `#NAME?` (and a crafted name can't run a
 *   formula). Numbers are never changed.
 * - The document starts with a UTF-8 byte order mark when asked, so Excel opens
 *   accents and other non-ASCII text correctly.
 */

export type CsvValue = string | number | null | undefined;

/** U+FEFF, written as EF BB BF in UTF-8. */
export const UTF8_BOM = '﻿';

const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** One field: empty for null/undefined, numbers as plain decimals, text quoted when needed. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return csvNumber(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A finite number as plain decimal text ("0", "61.23496995", "8.5"); anything else is empty. */
export function csvNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0)) return '0';
  const text = String(value);
  // Plain numbers never need quotes; exponent form (only for tiny or huge values) is
  // spelled out so every spreadsheet reads it the same way.
  return /e/i.test(text) ? value.toFixed(20).replace(/\.?0+$/, '') : text;
}

/** One record without its line ending. */
export function csvLine(values: readonly CsvValue[]): string {
  return values.map(csvField).join(',');
}

/** A whole document: header + rows, each record ending in CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[], options: { bom?: boolean } = {}): string {
  const lines = [csvLine(header), ...rows.map(csvLine)];
  return `${options.bom ? UTF8_BOM : ''}${lines.join('\r\n')}\r\n`;
}

/**
 * Parses CSV text written by `toCsv` (RFC 4180 quoting, CRLF or LF records, an
 * optional BOM) back into rows of text. Used by the tests to read exports back.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(UTF8_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
