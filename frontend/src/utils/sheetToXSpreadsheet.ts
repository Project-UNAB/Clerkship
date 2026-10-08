import * as XLSX from 'xlsx';
import type { SpreadsheetData } from 'x-data-spreadsheet';

/** Convierte un workbook ya leído por SheetJS al formato de datos que
 * espera x-data-spreadsheet (filas/columnas por hoja, con el texto
 * formateado tal como lo mostraría Excel). */
export function workbookToXSpreadsheetData(workbook: XLSX.WorkBook): SpreadsheetData {
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const ref = sheet['!ref'] || 'A1:A1';
    const range = XLSX.utils.decode_range(ref);

    const rows: Record<number, { cells: Record<number, { text: string }> }> = {};

    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: Record<number, { text: string }> = {};
      let hasCell = false;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[address] as XLSX.CellObject | undefined;
        if (!cell) continue;

        const text = cell.w !== undefined ? String(cell.w) : cell.v !== undefined ? String(cell.v) : '';
        if (text !== '') {
          cells[c] = { text };
          hasCell = true;
        }
      }

      if (hasCell) {
        rows[r] = { cells };
      }
    }

    (rows as any).len = range.e.r + 1;

    return {
      name,
      freeze: 'A1',
      rows,
      cols: { len: Math.max(range.e.c + 1, 26) },
    };
  });
}
