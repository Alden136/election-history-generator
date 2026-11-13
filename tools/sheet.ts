/**
 * Shared helpers for reading the frozen spreadsheet snapshot.
 */
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';

export const SNAPSHOT_PATH = 'reference/sheet-snapshot-2026-11-12.xlsx';

export type CellValue = string | number | boolean | null;

export interface Sheet {
  /** Number of rows and columns in the used range. */
  rows: number;
  cols: number;
  /** Computed value at an A1 address ("AD6"), or null when the cell is empty. */
  value(addr: string): CellValue;
  /** Formula text without the leading "=", or null when the cell holds a constant. */
  formula(addr: string): string | null;
  /** Values of a rectangular range ("A1:C3") as rows of cells. */
  range(a1: string): CellValue[][];
}

export function colName(index0: number): string {
  return XLSX.utils.encode_col(index0);
}

export function colIndex(name: string): number {
  return XLSX.utils.decode_col(name);
}

export function loadSheet(path: string = SNAPSHOT_PATH): Sheet {
  const workbook = XLSX.read(readFileSync(path), { cellFormula: true });
  const firstName = workbook.SheetNames[0];
  if (!firstName) throw new Error('Workbook has no sheets');
  const ws = workbook.Sheets[firstName];
  if (!ws || !ws['!ref']) throw new Error('First sheet is empty');
  const used = XLSX.utils.decode_range(ws['!ref']);

  const cell = (addr: string): XLSX.CellObject | undefined =>
    ws[addr] as XLSX.CellObject | undefined;

  const value = (addr: string): CellValue => {
    const c = cell(addr);
    if (!c || c.v === undefined) return null;
    if (c.t === 'e') return `#ERR:${String(c.w ?? c.v)}`;
    if (c.v instanceof Date) return c.v.toISOString();
    return c.v;
  };

  const formula = (addr: string): string | null => cell(addr)?.f ?? null;

  const range = (a1: string): CellValue[][] => {
    const r = XLSX.utils.decode_range(a1);
    const out: CellValue[][] = [];
    for (let row = r.s.r; row <= r.e.r; row++) {
      const line: CellValue[] = [];
      for (let col = r.s.c; col <= r.e.c; col++) {
        line.push(value(XLSX.utils.encode_cell({ r: row, c: col })));
      }
      out.push(line);
    }
    return out;
  };

  return { rows: used.e.r + 1, cols: used.e.c + 1, value, formula, range };
}
