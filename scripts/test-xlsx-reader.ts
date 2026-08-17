import assert from "node:assert/strict";
import path from "node:path";
import { readExcelWorkbook } from "../lib/xlsx-reader";

const requiredSheets = [
  "01_VENTAS_OPERATIVAS",
  "02_CLIENTES_UNICOS",
  "03_ASESORES",
  "04_PRODUCTOS_PLANES",
  "17_MAPEO_CRM",
  "18_CALIDAD_DATOS",
] as const;
const filePath = path.resolve("private/imports/yc-telecomunicaciones/REPORTE_VENTAS_TELECOM_DATA_LIMPIA.xlsx");
const workbook = readExcelWorkbook(filePath, requiredSheets);

assert.deepEqual(requiredSheets.filter((sheet) => !workbook.sheetNames.includes(sheet)), []);
assert.equal(workbook.sheets["01_VENTAS_OPERATIVAS"].rows.length, 1114);
assert.ok(workbook.sheets["01_VENTAS_OPERATIVAS"].headers.includes("DNI_CLIENTE"));
assert.ok(workbook.sheets["02_CLIENTES_UNICOS"].rows.length > 0);
assert.ok(Object.values(workbook.sheets).every((sheet) => sheet.rows.every((row) => Object.values(row).every((value) =>
  value === null || ["string", "number", "boolean"].includes(typeof value) || value instanceof Date
))));

console.log(JSON.stringify({ ok: true, filePath, sheetNames: workbook.sheetNames, testedSheets: requiredSheets }, null, 2));
