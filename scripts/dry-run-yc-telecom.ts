import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  normalizeAdvisorName,
  normalizeDocument,
  normalizeHistoricalProduct,
  normalizeHistoricalTransactionType,
  normalizePhone,
  normalizePlan,
  normalizeSaleStatus,
  normalizeText,
} from "../lib/telecom-normalization";
import { readExcelWorkbook, type ExcelRow } from "../lib/xlsx-reader";

const TENANT = { id: "cmrs70rk10019g4unlgr14mmj", slug: "yc-telecomunicaciones", name: "YC Telecomunicaciones" } as const;
const requiredSheets = ["01_VENTAS_OPERATIVAS", "02_CLIENTES_UNICOS", "03_ASESORES", "04_PRODUCTOS_PLANES", "17_MAPEO_CRM", "18_CALIDAD_DATOS"] as const;
const importRoot = path.resolve("private/imports/yc-telecomunicaciones");
const filePath = path.join(importRoot, "REPORTE_VENTAS_TELECOM_DATA_LIMPIA.xlsx");
const reportDir = path.join(importRoot, "dry-run");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Counts = { customers: number; sales: number; products: number; commercialPlans: number };
type Bucket = Record<string, number>;
const countBy = (values: string[]) => values.reduce<Bucket>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
const text = (value: unknown) => String(value ?? "").trim();
const planKey = (value: unknown) => {
  const source = text(value);
  if (!source) return null;
  const numeric = Number(source);
  return Number.isFinite(numeric) ? `PLAN_${numeric.toFixed(2)}` : normalizePlan(source);
};
const countDatabase = async (): Promise<Counts> => ({
  customers: await prisma.customer.count({ where: { tenantId: TENANT.id } }),
  sales: await prisma.sale.count({ where: { tenantId: TENANT.id } }),
  products: await prisma.product.count({ where: { tenantId: TENANT.id } }),
  commercialPlans: await prisma.commercialPlan.count({ where: { tenantId: TENANT.id } }),
});
const duplicateKeys = (rows: ExcelRow[], getter: (row: ExcelRow) => string | null) => {
  const frequencies = new Map<string, number>();
  for (const row of rows) {
    const key = getter(row);
    if (key) frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  return new Set([...frequencies].filter(([, frequency]) => frequency > 1).map(([key]) => key));
};

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT.slug } });
  assert.ok(tenant, "TENANT_YC_NO_ENCONTRADO");
  assert.equal(tenant.id, TENANT.id, "TENANT_ID_YC_NO_COINCIDE");

  const before = await countDatabase();
  const workbook = readExcelWorkbook(filePath, requiredSheets);
  const customersSource = workbook.sheets["02_CLIENTES_UNICOS"].rows;
  const salesSource = workbook.sheets["01_VENTAS_OPERATIVAS"].rows;
  const advisorsSource = workbook.sheets["03_ASESORES"].rows;
  const catalogSource = workbook.sheets["04_PRODUCTOS_PLANES"].rows;

  const [existingCustomers, existingSales, users, products, plans] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId: TENANT.id }, select: { document: true, phone: true } }),
    prisma.sale.findMany({ where: { tenantId: TENANT.id }, select: { sec: true, sot: true } }),
    prisma.user.findMany({ where: { tenantId: TENANT.id }, select: { id: true, name: true, status: true } }),
    prisma.product.findMany({ where: { tenantId: TENANT.id }, select: { code: true, name: true, status: true } }),
    prisma.commercialPlan.findMany({ where: { tenantId: TENANT.id }, select: { code: true, name: true, status: true } }),
  ]);

  const existingDocuments = new Set(existingCustomers.map((item) => normalizeDocument(item.document)).filter(Boolean));
  const existingPhones = new Set(existingCustomers.map((item) => normalizePhone(item.phone)).filter(Boolean));
  const sourceDuplicateDocuments = duplicateKeys(customersSource, (row) => normalizeDocument(row.DOCUMENTO));
  const sourceDuplicatePhones = duplicateKeys(customersSource, (row) => normalizePhone(row.TELEFONOS_E164 ?? row.TELEFONOS));
  const customerClassifications = customersSource.map((row) => {
    const document = normalizeDocument(row.DOCUMENTO), phone = normalizePhone(row.TELEFONOS_E164 ?? row.TELEFONOS), name = text(row.NOMBRE);
    if (!document || !phone || !name) return "DATOS_INCOMPLETOS";
    if (existingDocuments.has(document) || existingPhones.has(phone)) return "CLIENTE_EXISTENTE";
    if (sourceDuplicateDocuments.has(document) || sourceDuplicatePhones.has(phone)) return "POSIBLE_DUPLICADO";
    return "CLIENTE_NUEVO_VALIDO";
  });

  const usersByName = new Map<string, typeof users>();
  for (const user of users) {
    const key = normalizeAdvisorName(user.name);
    if (key) usersByName.set(key, [...(usersByName.get(key) ?? []), user]);
  }
  const advisorStatus = (value: unknown) => {
    const matches = usersByName.get(normalizeAdvisorName(value) ?? "") ?? [];
    if (matches.length > 1) return "NOMBRE_AMBIGUO";
    if (matches.length === 0) return "SIN_USUARIO_CRM";
    return matches[0].status === "ACTIVE" ? "MAPEADO_A_USUARIO_ACTIVO" : "MAPEADO_A_USUARIO_INACTIVO";
  };
  const advisorClassifications = advisorsSource.map((row) => advisorStatus(row.ASESOR_PROMOTOR));

  const productCodes = new Set(products.filter((item) => item.status === "ACTIVE").map((item) => item.code));
  const activePlanKeys = new Set(plans.filter((item) => item.status === "ACTIVE").flatMap((item) => [normalizePlan(item.code), normalizePlan(item.name)]).filter(Boolean));
  const catalogProductClassifications = catalogSource.map((row) => {
    const direct = normalizeText(row.PRODUCTO);
    const normalized = normalizeHistoricalProduct(row.CATEGORIA, row.PRODUCTO);
    if (normalized.status !== "MAPPED" || !productCodes.has(normalized.value)) return "PENDIENTE_DE_MAPEO";
    return direct === normalized.value.replaceAll("_", " ") ? "PRODUCTO_RECONOCIDO" : "PRODUCTO_NORMALIZADO";
  });
  const catalogPlanClassifications = catalogSource.map((row) => {
    const key = planKey(row.PLAN);
    if (!key) return "PENDIENTE_DE_MAPEO";
    return activePlanKeys.has(key) ? "PLAN_RECONOCIDO" : "PLAN_NO_CREADO";
  });

  const sourceDuplicateSec = duplicateKeys(salesSource, (row) => text(row.SEC) || null);
  const sourceDuplicateSot = duplicateKeys(salesSource, (row) => text(row.SOT) || null);
  const databaseSec = new Set(existingSales.map((item) => text(item.sec)).filter(Boolean));
  const databaseSot = new Set(existingSales.map((item) => text(item.sot)).filter(Boolean));
  const saleDetails = salesSource.map((row) => {
    const document = normalizeDocument(row.DNI_CLIENTE_2 ?? row.DNI_CLIENTE);
    const name = text(row.CLIENTE), date = text(row.FECHA_DE_VENTA), sec = text(row.SEC), sot = text(row.SOT);
    const advisor = advisorStatus(row.ASESOR ?? row.NOMBRE_ASESOR);
    const product = normalizeHistoricalProduct(row.TRANSACCION, row.DETALLE);
    const productAvailable = product.status === "MAPPED" && productCodes.has(product.value);
    const plan = planKey(row.PLAN);
    const planAvailable = Boolean(plan && activePlanKeys.has(plan));
    const status = normalizeSaleStatus(row.STATUS_VENTA);
    const transactionType = normalizeHistoricalTransactionType(row.TRANSACCION, row.DETALLE);
    const duplicate = Boolean((sec && (sourceDuplicateSec.has(sec) || databaseSec.has(sec))) || (sot && (sourceDuplicateSot.has(sot) || databaseSot.has(sot))));
    let classification = "LISTA_PARA_IMPORTAR";
    if (!document || !name || !date) classification = "DATOS_INCOMPLETOS";
    else if (duplicate) classification = "POSIBLE_DUPLICADO";
    else if (advisor !== "MAPEADO_A_USUARIO_ACTIVO") classification = "REQUIERE_MAPEO_ASESOR";
    else if (!productAvailable) classification = "REQUIERE_MAPEO_PRODUCTO";
    else if (!planAvailable) classification = "REQUIERE_MAPEO_PLAN";
    else if (status.status !== "MAPPED" || transactionType.status !== "MAPPED") classification = "REQUIERE_REVISION";
    return { classification, advisor, product: productAvailable ? "RECONOCIDO" : "PENDIENTE", plan: planAvailable ? "RECONOCIDO" : plan ? "PLAN_NO_CREADO" : "PENDIENTE", status: status.status, transactionType: transactionType.status };
  });

  const after = await countDatabase();
  const databaseUnchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!databaseUnchanged) throw new Error(`DRY_RUN_FAILED_UNEXPECTED_DATABASE_WRITE: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

  const salesByClassification = countBy(saleDetails.map((item) => item.classification));
  const customerBuckets = countBy(customerClassifications);
  const advisorBuckets = countBy(advisorClassifications);
  const productBuckets = countBy(catalogProductClassifications);
  const planBuckets = countBy(catalogPlanClassifications);
  const statusBuckets = countBy(saleDetails.map((item) => item.status === "MAPPED" ? "RECONOCIDO" : "PENDIENTE"));
  const transactionBuckets = countBy(saleDetails.map((item) => item.transactionType === "MAPPED" ? "RECONOCIDO" : "PENDIENTE"));
  const pendingReview = salesSource.length - (salesByClassification.LISTA_PARA_IMPORTAR ?? 0);
  const summary = {
    phase: "3B.1-B", mode: "DRY_RUN", generatedAt: new Date().toISOString(), tenant: TENANT,
    source: { filePath, requiredSheets, detectedSheets: workbook.sheetNames }, database: { before, after, unchanged: databaseUnchanged },
    customers: { analyzed: customersSource.length, classifications: customerBuckets, valid: customerBuckets.CLIENTE_NUEVO_VALIDO ?? 0, duplicates: customerBuckets.POSIBLE_DUPLICADO ?? 0, incomplete: customerBuckets.DATOS_INCOMPLETOS ?? 0, pending: customersSource.length - (customerBuckets.CLIENTE_NUEVO_VALIDO ?? 0) },
    sales: { analyzed: salesSource.length, classifications: salesByClassification, ready: salesByClassification.LISTA_PARA_IMPORTAR ?? 0, possibleDuplicates: salesByClassification.POSIBLE_DUPLICADO ?? 0, observed: pendingReview, pending: pendingReview },
    advisors: { found: advisorsSource.length, classifications: advisorBuckets, mapped: (advisorBuckets.MAPEADO_A_USUARIO_ACTIVO ?? 0) + (advisorBuckets.MAPEADO_A_USUARIO_INACTIVO ?? 0), pending: (advisorBuckets.SIN_USUARIO_CRM ?? 0) + (advisorBuckets.NOMBRE_AMBIGUO ?? 0) },
    products: { analyzed: catalogSource.length, classifications: productBuckets, recognized: productBuckets.PRODUCTO_RECONOCIDO ?? 0, normalized: productBuckets.PRODUCTO_NORMALIZADO ?? 0, pending: productBuckets.PENDIENTE_DE_MAPEO ?? 0 },
    plans: { analyzed: catalogSource.length, classifications: planBuckets, recognized: planBuckets.PLAN_RECONOCIDO ?? 0, normalized: planBuckets.PLAN_NO_CREADO ?? 0, pending: (planBuckets.PLAN_NO_CREADO ?? 0) + (planBuckets.PENDIENTE_DE_MAPEO ?? 0) },
    statuses: { analyzed: salesSource.length, recognized: statusBuckets.RECONOCIDO ?? 0, pending: statusBuckets.PENDIENTE ?? 0 },
    transactionTypes: { analyzed: salesSource.length, recognized: transactionBuckets.RECONOCIDO ?? 0, pending: transactionBuckets.PENDIENTE ?? 0 },
    pendingReview, commercialRecordsInserted: 0,
  };
  const report = `# FASE 3B.1-B — Dry-run Excel YC Telecomunicaciones\n\n- Modo: **DRY-RUN**\n- Tenant: ${TENANT.name} (\`${TENANT.slug}\`)\n- Archivo: \`${filePath}\`\n- Hojas obligatorias validadas: ${requiredSheets.join(", ")}\n\n## Clientes\n\n- Analizados: ${summary.customers.analyzed}\n- Válidos: ${summary.customers.valid}\n- Duplicados posibles: ${summary.customers.duplicates}\n- Incompletos: ${summary.customers.incomplete}\n- Pendientes: ${summary.customers.pending}\n\n## Ventas\n\n- Analizadas: ${summary.sales.analyzed}\n- Listas: ${summary.sales.ready}\n- Duplicadas posibles: ${summary.sales.possibleDuplicates}\n- Observadas: ${summary.sales.observed}\n- Pendientes: ${summary.sales.pending}\n\n## Asesores\n\n- Encontrados: ${summary.advisors.found}\n- Mapeados: ${summary.advisors.mapped}\n- Pendientes: ${summary.advisors.pending}\n\n## Productos\n\n- Reconocidos: ${summary.products.recognized}\n- Normalizados: ${summary.products.normalized}\n- Pendientes: ${summary.products.pending}\n\n## Planes\n\n- Reconocidos: ${summary.plans.recognized}\n- Normalizados: ${summary.plans.normalized}\n- Pendientes: ${summary.plans.pending}\n\n## Estados\n\n- Reconocidos: ${summary.statuses.recognized}\n- Pendientes: ${summary.statuses.pending}\n\n## Tipos de operación\n\n- Reconocidos: ${summary.transactionTypes.recognized}\n- Pendientes: ${summary.transactionTypes.pending}\n\n## Control PostgreSQL\n\n- Antes: \`${JSON.stringify(before)}\`\n- Después: \`${JSON.stringify(after)}\`\n- Conteos sin cambios: **${databaseUnchanged ? "SÍ" : "NO"}**\n\n**DRY-RUN: CERO REGISTROS COMERCIALES INSERTADOS.**\n`;
  await mkdir(reportDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportDir, "dry-run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(path.join(reportDir, "dry-run-report.md"), report, "utf8"),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
