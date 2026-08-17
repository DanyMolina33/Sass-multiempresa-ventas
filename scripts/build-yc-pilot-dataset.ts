import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { normalizeDate, normalizeDocument, normalizeSaleStatus, normalizeText } from "../lib/telecom-normalization";
import { readExcelWorkbook, type ExcelRow } from "../lib/xlsx-reader";

const TENANT = { id: "cmrs70rk10019g4unlgr14mmj", slug: "yc-telecomunicaciones", name: "YC Telecomunicaciones" } as const;
const requiredSheets = ["01_VENTAS_OPERATIVAS", "02_CLIENTES_UNICOS", "03_ASESORES", "04_PRODUCTOS_PLANES", "17_MAPEO_CRM", "18_CALIDAD_DATOS"] as const;
const importRoot = path.resolve("private/imports/yc-telecomunicaciones");
const filePath = path.join(importRoot, "REPORTE_VENTAS_TELECOM_DATA_LIMPIA.xlsx");
const outputDir = path.join(importRoot, "pilot");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Counts = { customers: number; sales: number; products: number; commercialPlans: number };
type ProposedProductCode = "MOVIL_POSTPAGO" | "MOVIL_PREPAGO" | "INTERNET_FIJO" | "TELEFONIA_FIJA" | "TV" | "INTERNET_INALAMBRICO";
type ProposedOperationCode = "PORTABILIDAD" | "MIGRACION" | "RENOVACION" | "ALTA_NUEVA";
const text = (value: unknown) => String(value ?? "").trim();
const databaseCounts = async (): Promise<Counts> => ({
  customers: await prisma.customer.count({ where: { tenantId: TENANT.id } }),
  sales: await prisma.sale.count({ where: { tenantId: TENANT.id } }),
  products: await prisma.product.count({ where: { tenantId: TENANT.id } }),
  commercialPlans: await prisma.commercialPlan.count({ where: { tenantId: TENANT.id } }),
});
const frequencySet = (rows: ExcelRow[], getter: (row: ExcelRow) => string | null) => {
  const frequencies = new Map<string, number>();
  for (const row of rows) {
    const key = getter(row);
    if (key) frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  return new Set([...frequencies].filter(([, count]) => count > 1).map(([key]) => key));
};
const firstPhone = (value: unknown) => {
  const source = text(value);
  const e164 = source.match(/(?:\+?51)?(9\d{8})/);
  return e164 ? `+51${e164[1]}` : null;
};
const planPrice = (value: unknown) => {
  const numeric = Number(text(value));
  return Number.isFinite(numeric) && numeric > 1 ? Math.round(numeric * 100) / 100 : null;
};
const operation = (value: unknown): ProposedOperationCode | null => {
  const source = normalizeText(value);
  if (source.includes("PORTABILIDAD")) return "PORTABILIDAD";
  if (source.includes("MIGRACION")) return "MIGRACION";
  if (source.includes("RENOVACION")) return "RENOVACION";
  if (source.includes("ALTA NUEVA") || source.startsWith("ALTA POST") || source.startsWith("ALTA PRE")) return "ALTA_NUEVA";
  return null;
};
const productFamily = (categoryValue: unknown, detailValue: unknown): ProposedProductCode | null => {
  const category = normalizeText(categoryValue), detail = normalizeText(detailValue);
  if (category === "INALAMBRICO" || detail.includes("INTERNET INALAMBRICO")) return "INTERNET_INALAMBRICO";
  if (detail.includes("WIFI") || detail.includes("DECO")) return null;
  if (detail.includes("TV") && !detail.includes("INTERNET")) return "TV";
  if ((detail.includes("TELEFON") || detail === "FIJO" || detail === "FIJA") && !detail.includes("INTERNET") && !detail.includes("TV")) return "TELEFONIA_FIJA";
  if (detail.includes("INTERNET") && !detail.includes("TV") && !detail.includes("TELEFON")) return "INTERNET_FIJO";
  if (category === "POST PAGO" || category === "POSTPAGO") return "MOVIL_POSTPAGO";
  if (category === "PRE PAGO" || category === "PREPAGO") return "MOVIL_PREPAGO";
  return null;
};
const msisdn = (row: ExcelRow) => {
  if (normalizeText(row.TRANSACCION) === "FIJA") return null;
  return firstPhone(row.F_INSTALACION_CEL);
};
const codeForPlan = (product: ProposedProductCode, price: number) => `${product}_${price.toFixed(2).replace(".", "_")}`;

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT.slug } });
  assert.ok(tenant && tenant.id === TENANT.id, "TENANT_YC_INVALIDO");
  const before = await databaseCounts();
  const workbook = readExcelWorkbook(filePath, requiredSheets);
  const salesRows = workbook.sheets["01_VENTAS_OPERATIVAS"].rows;
  const customerRows = workbook.sheets["02_CLIENTES_UNICOS"].rows;
  const advisorRows = workbook.sheets["03_ASESORES"].rows;
  const combinationRows = workbook.sheets["04_PRODUCTOS_PLANES"].rows;

  const duplicateDocuments = frequencySet(customerRows, (row) => normalizeDocument(row.DOCUMENTO));
  const duplicatePhones = frequencySet(customerRows, (row) => firstPhone(row.TELEFONOS_E164 ?? row.TELEFONOS));
  const pilotCustomers: Array<Record<string, unknown>> = [];
  const excludedCustomers: Array<Record<string, unknown>> = [];
  const customerDisposition = new Map<string, string>();
  for (const row of customerRows) {
    const document = normalizeDocument(row.DOCUMENTO), phone = firstPhone(row.TELEFONOS_E164 ?? row.TELEFONOS), name = text(row.NOMBRE);
    let disposition = "INCLUIR_PILOTO";
    const reasons: string[] = [];
    if (!document || ![8, 11].includes(document.length) || !phone || !name) {
      disposition = "EXCLUIR_INCOMPLETO";
      if (!document || ![8, 11].includes(document.length)) reasons.push("DOCUMENTO_INVALIDO_O_AUSENTE");
      if (!phone) reasons.push("TELEFONO_INVALIDO_O_AUSENTE");
      if (!name) reasons.push("NOMBRE_AUSENTE");
    } else if (duplicateDocuments.has(document) || duplicatePhones.has(phone)) {
      disposition = "EXCLUIR_DUPLICADO";
      if (duplicateDocuments.has(document)) reasons.push("DOCUMENTO_REPETIDO");
      if (duplicatePhones.has(phone)) reasons.push("TELEFONO_REPETIDO");
    }
    if (document) customerDisposition.set(document, disposition);
    const record = { sourceDocument: text(row.DOCUMENTO), document, documentType: text(row.TIPO_DOCUMENTO), name, phone, disposition, reasons };
    (disposition === "INCLUIR_PILOTO" ? pilotCustomers : excludedCustomers).push(record);
  }

  const distinctProductExamples = new Map<ProposedProductCode, Set<string>>();
  for (const row of salesRows) {
    const category = row.TRANSACCION, detail = row.DETALLE;
    const family = productFamily(category, detail);
    const example = family === "MOVIL_POSTPAGO" || family === "MOVIL_PREPAGO" ? text(category) : text(detail);
    if (family) distinctProductExamples.set(family, new Set([...(distinctProductExamples.get(family) ?? []), example]));
  }
  for (const row of combinationRows) {
    const family = productFamily(row.CATEGORIA, row.PRODUCTO);
    const example = family === "MOVIL_POSTPAGO" || family === "MOVIL_PREPAGO"
      ? (operation(row.PRODUCTO) ? text(row.CATEGORIA) : text(row.PRODUCTO))
      : text(row.PRODUCTO);
    if (family) distinctProductExamples.set(family, new Set([...(distinctProductExamples.get(family) ?? []), example]));
  }
  const proposedProductDefinitions: Array<{ code: ProposedProductCode; name: string }> = [
    { code: "MOVIL_POSTPAGO", name: "Móvil postpago" },
    { code: "MOVIL_PREPAGO", name: "Móvil prepago" },
    { code: "INTERNET_FIJO", name: "Internet fijo" },
    { code: "TELEFONIA_FIJA", name: "Telefonía fija" },
    { code: "TV", name: "Televisión" },
    { code: "INTERNET_INALAMBRICO", name: "Internet inalámbrico" },
  ];
  const pilotProducts = proposedProductDefinitions.filter((item) => distinctProductExamples.has(item.code)).map((item) => ({
    ...item,
    associatedSales: salesRows.filter((row) => productFamily(row.TRANSACCION, row.DETALLE) === item.code).length,
    aliases: [...(distinctProductExamples.get(item.code) ?? [])].filter(Boolean).sort(),
    evidence: item.code === "INTERNET_INALAMBRICO" ? "04_PRODUCTOS_PLANES" : "01_VENTAS_OPERATIVAS y/o 04_PRODUCTOS_PLANES",
  }));

  const operationAliases = new Map<ProposedOperationCode, Set<string>>();
  for (const row of [...salesRows, ...combinationRows]) {
    const raw = row.DETALLE ?? row.TIPO_OPERACION;
    const mapped = operation(raw);
    if (mapped) operationAliases.set(mapped, new Set([...(operationAliases.get(mapped) ?? []), text(raw)]));
  }
  const pilotOperations = (["PORTABILIDAD", "MIGRACION", "RENOVACION", "ALTA_NUEVA"] as ProposedOperationCode[]).filter((code) => operationAliases.has(code)).map((code) => ({ code, name: code.replaceAll("_", " "), aliases: [...(operationAliases.get(code) ?? [])].filter(Boolean).sort() }));

  const prelimSales = salesRows.map((row) => {
    const document = normalizeDocument(row.DNI_CLIENTE_2 ?? row.DNI_CLIENTE), product = productFamily(row.TRANSACCION, row.DETALLE), mappedOperation = operation(row.DETALLE);
    const detectedPlanPrice = product === "MOVIL_POSTPAGO" ? planPrice(row.PLAN) : null;
    const saleDate = normalizeDate(row.FECHA_DE_VENTA), status = normalizeSaleStatus(row.STATUS_VENTA);
    const identifiers = { sec: text(row.SEC) || null, sot: text(row.SOT) || null, msisdn: msisdn(row) };
    const signature = [identifiers.sec, identifiers.sot, identifiers.msisdn, saleDate?.toISOString().slice(0, 10), document, product, mappedOperation, detectedPlanPrice].join("|");
    return { row, document, product, operation: mappedOperation, planPrice: detectedPlanPrice, saleDate, status, identifiers, signature };
  });
  const duplicateSignatures = frequencySet(prelimSales.map((item) => ({ SIGNATURE: item.signature })), (row) => text(row.SIGNATURE) || null);
  const identifierSignatures = new Map<string, Set<string>>();
  for (const item of prelimSales) {
    for (const identifier of [item.identifiers.sec && `SEC:${item.identifiers.sec}`, item.identifiers.sot && `SOT:${item.identifiers.sot}`, item.identifiers.msisdn && `MSISDN:${item.identifiers.msisdn}`].filter(Boolean) as string[]) {
      identifierSignatures.set(identifier, new Set([...(identifierSignatures.get(identifier) ?? []), item.signature]));
    }
  }
  const conflictingIdentifiers = new Set([...identifierSignatures].filter(([, signatures]) => signatures.size > 1).map(([identifier]) => identifier));

  const pilotSales: Array<Record<string, unknown>> = [];
  const excludedSales: Array<Record<string, unknown>> = [];
  for (const item of prelimSales) {
    const reasons: string[] = [];
    if (!item.document || customerDisposition.get(item.document) !== "INCLUIR_PILOTO") reasons.push("CLIENTE_NO_CONFIABLE");
    if (!item.product) reasons.push("PRODUCTO_AMBIGUO");
    if (!item.operation) reasons.push("OPERACION_DESCONOCIDA");
    if (item.planPrice == null) reasons.push("PLAN_AMBIGUO_O_NO_APLICABLE");
    if (!item.saleDate) reasons.push("FECHA_INVALIDA");
    if (item.status.status !== "MAPPED") reasons.push("ESTADO_DESCONOCIDO");
    if (!item.identifiers.sec && !item.identifiers.sot && !item.identifiers.msisdn) reasons.push("TRAZABILIDAD_INSUFICIENTE");
    const identifiers = [item.identifiers.sec && `SEC:${item.identifiers.sec}`, item.identifiers.sot && `SOT:${item.identifiers.sot}`, item.identifiers.msisdn && `MSISDN:${item.identifiers.msisdn}`].filter(Boolean) as string[];
    if (duplicateSignatures.has(item.signature) || identifiers.some((identifier) => conflictingIdentifiers.has(identifier))) reasons.push("EXCLUIR_PILOTO_DUPLICADO");
    const record = {
      sourceRow: item.row.FILA_ORIGEN, customerDocument: item.document, customerName: text(item.row.CLIENTE), productCode: item.product,
      operationCode: item.operation, planCode: item.product && item.planPrice != null ? codeForPlan(item.product, item.planPrice) : null,
      planPrice: item.planPrice, saleDate: item.saleDate?.toISOString() ?? null, status: item.status.status === "MAPPED" ? item.status.value : null,
      historicalAdvisorName: text(item.row.ASESOR ?? item.row.NOMBRE_ASESOR) || null, assignedUserId: null,
      sec: item.identifiers.sec, sot: item.identifiers.sot, msisdn: item.identifiers.msisdn, source: "YC_EXCEL_HISTORICO", disposition: reasons.length === 0 ? "LISTA_PARA_PILOTO" : "EXCLUIR_PILOTO", reasons,
    };
    (reasons.length === 0 ? pilotSales : excludedSales).push(record);
  }

  const plansByCode = new Map<string, { code: string; name: string; productCode: ProposedProductCode; price: number; historicalRecords: number; aliases: Set<string> }>();
  for (const sale of pilotSales) {
    const code = sale.planCode as string, productCode = sale.productCode as ProposedProductCode, detectedPrice = sale.planPrice as number;
    const source = salesRows.find((row) => row.FILA_ORIGEN === sale.sourceRow);
    const current = plansByCode.get(code);
    plansByCode.set(code, { code, name: `${productCode === "MOVIL_POSTPAGO" ? "Móvil postpago" : productCode} ${detectedPrice.toFixed(2)}`, productCode, price: detectedPrice, historicalRecords: (current?.historicalRecords ?? 0) + 1, aliases: new Set([...(current?.aliases ?? []), text(source?.PLAN)]) });
  }
  const planCodeSet = new Set(plansByCode.keys());
  const planReview = combinationRows.map((row) => {
    const historical = text(row.PLAN), family = productFamily(row.CATEGORIA, row.PRODUCTO), normalized = normalizeText(historical);
    const detected = family === "MOVIL_POSTPAGO" ? (planPrice(row.PRECIO_REFERENCIAL) ?? Number(historical.match(/(\d+(?:\.\d{1,2})?)(?!.*\d)/)?.[1] ?? NaN)) : null;
    const normalizedPrice = detected != null && Number.isFinite(detected) && detected > 1 ? Math.round(detected * 100) / 100 : null;
    const candidateCode = family && normalizedPrice != null ? codeForPlan(family, normalizedPrice) : null;
    if (!historical || historical === "0" || historical === "1" || ["PORTABILIDAD", "MIGRACION", "RENOVACION", "ALTA NUEVA", "POSTPAGO", "PREPAGO", "MOVIL", "INTERNET"].includes(normalized)) {
      return { historical, productCode: family, classification: "NO_ES_PLAN" };
    }
    if (candidateCode && planCodeSet.has(candidateCode)) {
      plansByCode.get(candidateCode)?.aliases.add(historical);
      return { historical, productCode: family, masterPlanCode: candidateCode, classification: "ALIAS_DE_PLAN" };
    }
    return { historical, productCode: family, classification: family ? "EXCLUIR_PILOTO" : "AMBIGUO" };
  });
  const pilotPlans = [...plansByCode.values()].sort((a, b) => a.price - b.price).map((item) => ({ ...item, aliases: [...item.aliases].filter(Boolean).sort(), classification: "PLAN_MAESTRO_VALIDO" }));

  const pilotCustomerDocuments = new Set(pilotCustomers.map((item) => item.document));
  const pilotProductCodes = new Set(pilotProducts.map((item) => item.code));
  const pilotOperationCodes = new Set(pilotOperations.map((item) => item.code));
  const pilotPlanCodes = new Set(pilotPlans.map((item) => item.code));
  assert.ok(pilotCustomers.length > 0 && pilotSales.length > 0 && pilotProducts.length > 0 && pilotOperations.length > 0 && pilotPlans.length > 0, "PILOT_QUALITY_EMPTY_CATALOG_OR_DATASET");
  assert.ok(pilotSales.every((sale) => pilotCustomerDocuments.has(sale.customerDocument)), "PILOT_SALE_WITHOUT_CUSTOMER");
  assert.ok(pilotSales.every((sale) => pilotProductCodes.has(sale.productCode as ProposedProductCode)), "PILOT_SALE_WITHOUT_PRODUCT");
  assert.ok(pilotSales.every((sale) => pilotOperationCodes.has(sale.operationCode as ProposedOperationCode)), "PILOT_SALE_WITHOUT_OPERATION");
  assert.ok(pilotSales.every((sale) => pilotPlanCodes.has(sale.planCode as string)), "PILOT_SALE_WITHOUT_PLAN");
  assert.equal(new Set(pilotSales.map((sale) => [sale.sec, sale.sot, sale.msisdn, sale.saleDate, sale.customerDocument, sale.productCode, sale.operationCode, sale.planCode].join("|"))).size, pilotSales.length, "PILOT_DUPLICATE_SIGNATURE");

  const productAliasCount = pilotProducts.reduce((total, item) => total + Math.max(0, item.aliases.length - 1), 0);
  const operationAliasCount = pilotOperations.reduce((total, item) => total + Math.max(0, item.aliases.length - 1), 0);
  const planAliasCount = pilotPlans.reduce((total, item) => total + Math.max(0, item.aliases.length - 1), 0);
  const exclusionReasons = Object.fromEntries([...new Set(excludedSales.flatMap((item) => item.reasons as string[]))].sort().map((reason) => [reason, excludedSales.filter((item) => (item.reasons as string[]).includes(reason)).length]));
  const customerExclusions = Object.fromEntries(["EXCLUIR_DUPLICADO", "EXCLUIR_INCOMPLETO", "EXCLUIR_AMBIGUO"].map((status) => [status, excludedCustomers.filter((item) => item.disposition === status).length]));
  const after = await databaseCounts();
  assert.deepEqual(after, before, `PILOT_READ_ONLY_FAILED: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  const summary = {
    phase: "3B.1-B.2", mode: "READ_ONLY_PILOT_DATASET", generatedAt: new Date().toISOString(), tenant: TENANT,
    source: { filePath, historicalCombinations: combinationRows.length },
    products: {
      historicalValues: new Set([...salesRows.map((row) => text(row.DETALLE)), ...combinationRows.map((row) => text(row.PRODUCTO))].filter(Boolean)).size,
      proposed: pilotProducts.length,
      catalog: pilotProducts,
      reclassifiedAsOperations: [...new Set([...salesRows.map((row) => text(row.DETALLE)), ...combinationRows.map((row) => text(row.PRODUCTO))].filter((value) => operation(value)))].sort(),
      excludedHistoricalValues: [...new Set(combinationRows.filter((row) => !productFamily(row.CATEGORIA, row.PRODUCTO)).map((row) => text(row.PRODUCTO)).filter(Boolean))].sort(),
      reclassifySeedProduct: { code: "RENOVACION", decision: "RECLASIFICAR_COMO_OPERACION" },
      excludedConcepts: ["EQUIPO_CELULAR: evidencia insuficiente de dispositivo individual", "OTRO: sin evidencia necesaria para el catálogo piloto"],
    },
    operations: { proposed: pilotOperations.length, catalog: pilotOperations },
    plans: {
      historicalCombinations: combinationRows.length,
      proposed: pilotPlans.length,
      catalog: pilotPlans,
      review: planReview,
      discardedNotPlans: new Set(planReview.filter((item) => item.classification === "NO_ES_PLAN").map((item) => item.historical || "(VACÍO)")).size,
      discardedNotPlanRows: planReview.filter((item) => item.classification === "NO_ES_PLAN").length,
      ambiguousExcluded: planReview.filter((item) => ["AMBIGUO", "EXCLUIR_PILOTO"].includes(item.classification)).length,
    },
    aliases: { products: productAliasCount, operations: operationAliasCount, plans: planAliasCount, total: productAliasCount + operationAliasCount + planAliasCount },
    customers: { analyzed: customerRows.length, pilot: pilotCustomers.length, excluded: excludedCustomers.length, exclusions: customerExclusions },
    sales: { analyzed: salesRows.length, pilot: pilotSales.length, excluded: excludedSales.length, exclusionReasons },
    advisors: { historical: advisorRows.length, salesPreservingHistoricalAdvisorName: pilotSales.filter((item) => item.historicalAdvisorName).length, usersCreated: 0 },
    database: { before, after, unchanged: true }, writes: 0,
  };
  const report = `# Dataset piloto limpio — YC Telecomunicaciones\n\n## Productos\n\n- Valores históricos encontrados: ${summary.products.historicalValues}\n- Productos maestros propuestos: ${summary.products.proposed}\n- Catálogo: ${pilotProducts.map((item) => item.code).join(", ")}\n- RENOVACION: **RECLASIFICAR_COMO_OPERACION**\n\n## Operaciones\n\n- Tipos definitivos: ${pilotOperations.map((item) => item.code).join(", ")}\n\n## Planes\n\n- Combinaciones históricas iniciales: ${combinationRows.length}\n- Planes maestros reales del piloto: ${pilotPlans.length}\n- Planes: ${pilotPlans.map((item) => item.code).join(", ")}\n- Valores que no eran planes: ${summary.plans.discardedNotPlans}\n- Valores ambiguos o excluidos: ${summary.plans.ambiguousExcluded}\n\n## Clientes\n\n- Analizados: ${customerRows.length}\n- Aptos: ${pilotCustomers.length}\n- Excluidos: ${excludedCustomers.length}\n- Duplicados: ${customerExclusions.EXCLUIR_DUPLICADO}\n- Incompletos: ${customerExclusions.EXCLUIR_INCOMPLETO}\n- Ambiguos: ${customerExclusions.EXCLUIR_AMBIGUO}\n\n## Ventas\n\n- Analizadas: ${salesRows.length}\n- Aptas: ${pilotSales.length}\n- Excluidas: ${excludedSales.length}\n- Motivos: ${JSON.stringify(exclusionReasons)}\n\n## Asesores\n\n- Históricos: ${advisorRows.length}\n- Ventas piloto conservando historicalAdvisorName: ${summary.advisors.salesPreservingHistoricalAdvisorName}\n- Usuarios creados: 0\n\n## Control PostgreSQL\n\n- Antes: ${JSON.stringify(before)}\n- Después: ${JSON.stringify(after)}\n\n**DATASET PILOTO LIMPIO GENERADO.**\n\n**CERO ESCRITURAS EN POSTGRESQL.**\n`;
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "pilot-customers.json"), `${JSON.stringify(pilotCustomers, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-sales.json"), `${JSON.stringify(pilotSales, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-products.json"), `${JSON.stringify(pilotProducts, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-plans.json"), `${JSON.stringify(pilotPlans, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-operations.json"), `${JSON.stringify(pilotOperations, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "excluded-customers.json"), `${JSON.stringify(excludedCustomers, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "excluded-sales.json"), `${JSON.stringify(excludedSales, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "pilot-report.md"), report, "utf8"),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
