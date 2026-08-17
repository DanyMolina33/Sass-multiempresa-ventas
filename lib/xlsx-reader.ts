import * as fs from "node:fs";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

export type ExcelCellValue = string | number | boolean | Date | null;
export type ExcelRow = Record<string, ExcelCellValue>;

export type ExcelSheetData = {
  name: string;
  headers: string[];
  rows: ExcelRow[];
};

export type ExcelWorkbookData = {
  filePath: string;
  sheetNames: string[];
  sheets: Record<string, ExcelSheetData>;
};

function normalizeCellValue(value: unknown): ExcelCellValue {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) {
    return value ?? null;
  }

  return String(value);
}

export function listExcelSheetNames(filePath: string) {
  return XLSX.readFile(filePath, { bookSheets: true }).SheetNames;
}

export function readExcelWorkbook(filePath: string, requestedSheets?: readonly string[]): ExcelWorkbookData {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    raw: true,
  });
  const selectedNames = requestedSheets ? [...requestedSheets] : workbook.SheetNames;
  const missingSheets = selectedNames.filter((name) => !workbook.SheetNames.includes(name));

  if (missingSheets.length > 0) {
    throw new Error(`HOJAS_OBLIGATORIAS_NO_ENCONTRADAS: ${missingSheets.join(", ")}`);
  }

  const sheets = Object.fromEntries(selectedNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<ExcelCellValue[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    const headers = (matrix[0] ?? []).map((value, index) => String(value ?? `COLUMN_${index + 1}`).trim());
    const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [
      header,
      normalizeCellValue(values[index]),
    ])));

    return [name, { name, headers, rows } satisfies ExcelSheetData];
  }));

  return { filePath, sheetNames: workbook.SheetNames, sheets };
}
