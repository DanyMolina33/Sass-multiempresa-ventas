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
  normalizeSaleStatus,
  normalizeText,
  YC_PRODUCT_CATALOG,
} from "../lib/telecom-normalization";
import { readExcelWorkbook, type ExcelRow } from "../lib/xlsx-reader";

const TENANT = { id: "cmrs70rk10019g4unlgr14mmj", slug: "yc-telecomunicaciones", name: "YC Telecomunicaciones" } as const;
const requiredSheets = ["01_VENTAS_OPERATIVAS", "02_CLIENTES_UNICOS", "03_ASESORES", "04_PRODUCTOS_PLANES", "17_MAPEO_CRM", "18_CALIDAD_DATOS"] as const;
const importRoot = path.resolve("private/imports/yc-telecomunicaciones");
const filePath = path.join(importRoot, "REPORTE_VENTAS_TELECOM_DATA_LIMPIA.xlsx");
const outputDir = path.join(importRoot, "mapping");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Counts = { customers: number; sales: number; products: number; commercialPlans: number };
const databaseCounts = async (): Promise<Counts> => ({
  customers: await prisma.customer.count({ where: { tenantId: TENANT.id } }),
  sales: await prisma.sale.count({ where: { tenantId: TENANT.id } }),
  products: await prisma.product.count({ where: { tenantId: TENANT.id } }),
  commercialPlans: await prisma.commercialPlan.count({ where: { tenantId: TENANT.id } }),
});
const text = (value: unknown) => String(value ?? "").trim();
const md = (value: unknown) => text(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const price = (value: unknown) => {
  const numeric = Number(text(value));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
};
const duplicateKeys = (rows: ExcelRow[], getter: (row: ExcelRow) => string | null) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getter(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
};
const bucket = (items: string[]) => Object.fromEntries([...new Set(items)].sort().map((status) => [status, items.filter((item) => item === status).length]));

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT.slug } });
  assert.ok(tenant, "TENANT_YC_NO_ENCONTRADO");
  assert.equal(tenant.id, TENANT.id, "TENANT_ID_YC_NO_COINCIDE");
  const before = await databaseCounts();
  const workbook = readExcelWorkbook(filePath, requiredSheets);
  const sales = workbook.sheets["01_VENTAS_OPERATIVAS"].rows;
  const customers = workbook.sheets["02_CLIENTES_UNICOS"].rows;
  const advisorRows = workbook.sheets["03_ASESORES"].rows;
  const catalogRows = workbook.sheets["04_PRODUCTOS_PLANES"].rows;

  const [databaseProducts, databasePlans, users, existingCustomers, existingSales] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: TENANT.id }, select: { code: true, name: true, category: true, status: true, createdAt: true, updatedAt: true }, orderBy: { code: "asc" } }),
    prisma.commercialPlan.findMany({ where: { tenantId: TENANT.id }, select: { code: true, name: true } }),
    prisma.user.findMany({ where: { tenantId: TENANT.id }, select: { name: true, email: true, status: true }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({ where: { tenantId: TENANT.id }, select: { document: true, phone: true } }),
    prisma.sale.findMany({ where: { tenantId: TENANT.id }, select: { sec: true, sot: true } }),
  ]);
  assert.deepEqual(databaseProducts.map((item) => item.code), [...YC_PRODUCT_CATALOG].map((item) => item.code).sort(), "CATALOGO_MAESTRO_YC_NO_COINCIDE");
  assert.equal(databasePlans.length, 0, "YC_YA_TIENE_PLANES_COMERCIALES");
  const activeProductCodes = new Set(databaseProducts.filter((item) => item.status === "ACTIVE").map((item) => item.code));

  const productGroups = new Map<string, { historical: string; category: string; normalizedProduct: string; appearances: number; status: string }>();
  for (const row of catalogRows) {
    const historical = text(row.PRODUCTO), category = text(row.CATEGORIA);
    const normalized = normalizeHistoricalProduct(category, historical);
    const normalizedProduct = normalized.status === "MAPPED" ? normalized.value : "";
    const status = normalizedProduct && activeProductCodes.has(normalizedProduct) ? "MAPEADO_A_PRODUCTO_MAESTRO" : "PENDIENTE_REVISION";
    const key = `${normalizeText(historical)}|${normalizeText(category)}|${normalizedProduct}`;
    const current = productGroups.get(key);
    productGroups.set(key, { historical, category, normalizedProduct, appearances: (current?.appearances ?? 0) + 1, status });
  }

  type PlanGroup = { historicalPlan: string; normalizedProduct: string; detectedPrice: number | null; appearances: number; suggestedMasterPlan: string; status: string; sources: Set<string> };
  const planGroups = new Map<string, PlanGroup>();
  for (const row of catalogRows) {
    const historicalPlan = text(row.PLAN), normalized = normalizeHistoricalProduct(row.CATEGORIA, row.PRODUCTO);
    const normalizedProduct = normalized.status === "MAPPED" && activeProductCodes.has(normalized.value) ? normalized.value : "";
    const detectedPrice = price(row.PRECIO_REFERENCIAL ?? row.PLAN);
    const suggestedMasterPlan = normalizedProduct && detectedPrice != null ? `${normalizedProduct}_${detectedPrice.toFixed(2).replace(".", "_")}` : "";
    const key = `${normalizeText(historicalPlan)}|${normalizedProduct}|${detectedPrice ?? ""}`;
    const current = planGroups.get(key);
    planGroups.set(key, {
      historicalPlan, normalizedProduct, detectedPrice, appearances: (current?.appearances ?? 0) + 1,
      suggestedMasterPlan, status: "", sources: new Set([...(current?.sources ?? []), text(row.FUENTE)]),
    });
  }
  const suggestedFrequencies = new Map<string, number>();
  const historicalVariants = new Map<string, Set<string>>();
  for (const group of planGroups.values()) {
    if (group.suggestedMasterPlan) suggestedFrequencies.set(group.suggestedMasterPlan, (suggestedFrequencies.get(group.suggestedMasterPlan) ?? 0) + 1);
    const historicalKey = normalizeText(group.historicalPlan);
    historicalVariants.set(historicalKey, new Set([...(historicalVariants.get(historicalKey) ?? []), `${group.normalizedProduct}|${group.detectedPrice}`]));
  }
  for (const group of planGroups.values()) {
    if (!group.historicalPlan || group.detectedPrice == null) group.status = "PENDIENTE_REVISION";
    else if (!group.normalizedProduct || (historicalVariants.get(normalizeText(group.historicalPlan))?.size ?? 0) > 1) group.status = "AMBIGUO";
    else if ((suggestedFrequencies.get(group.suggestedMasterPlan) ?? 0) > 1) group.status = "POSIBLE_DUPLICADO";
    else group.status = "PLAN_MAESTRO_SUGERIDO";
  }
  const planList = [...planGroups.values()].sort((a, b) => a.suggestedMasterPlan.localeCompare(b.suggestedMasterPlan) || a.historicalPlan.localeCompare(b.historicalPlan));
  const uniqueSuggestedPlans = new Set(planList.filter((item) => item.suggestedMasterPlan).map((item) => item.suggestedMasterPlan));

  const usersByNormalizedName = new Map<string, typeof users>();
  for (const user of users) {
    const key = normalizeAdvisorName(user.name);
    if (key) usersByNormalizedName.set(key, [...(usersByNormalizedName.get(key) ?? []), user]);
  }
  const advisorMappings = advisorRows.map((row) => {
    const historicalName = text(row.ASESOR_PROMOTOR);
    const exact = usersByNormalizedName.get(normalizeAdvisorName(historicalName) ?? "") ?? [];
    const salesCount = sales.filter((sale) => normalizeAdvisorName(sale.ASESOR ?? sale.NOMBRE_ASESOR) === normalizeAdvisorName(historicalName)).length;
    let status = "HISTORICO_SIN_USUARIO", possibleUser = "";
    if (exact.length === 1) { status = "MAPEAR_A_USUARIO_EXISTENTE"; possibleUser = `${exact[0].name} <${exact[0].email}>`; }
    else if (exact.length > 1) { status = "AMBIGUO"; possibleUser = exact.map((item) => item.email).join(", "); }
    else if (!historicalName) status = "PENDIENTE_REVISION";
    return { historicalName, salesCount, possibleUser, status };
  });
  const advisorStatusByName = new Map(advisorMappings.map((item) => [normalizeAdvisorName(item.historicalName), item.status]));

  const duplicatedDocuments = duplicateKeys(customers, (row) => normalizeDocument(row.DOCUMENTO));
  const duplicatedPhones = duplicateKeys(customers, (row) => normalizePhone(row.TELEFONOS_E164 ?? row.TELEFONOS));
  const duplicatedNames = duplicateKeys(customers, (row) => normalizeText(row.NOMBRE) || null);
  const dbDocuments = new Set(existingCustomers.map((item) => normalizeDocument(item.document)).filter(Boolean));
  const dbPhones = new Set(existingCustomers.map((item) => normalizePhone(item.phone)).filter(Boolean));
  const customerReview = customers.flatMap((row) => {
    const document = normalizeDocument(row.DOCUMENTO), phone = normalizePhone(row.TELEFONOS_E164 ?? row.TELEFONOS), name = text(row.NOMBRE);
    const causes: string[] = [];
    if (!document) causes.push("FALTA_DOCUMENTO");
    if (!phone) causes.push("FALTA_TELEFONO");
    if (!name) causes.push("OTRO: FALTA_NOMBRE");
    if (document && (duplicatedDocuments.has(document) || dbDocuments.has(document))) causes.push("DOCUMENTO_REPETIDO");
    if (phone && (duplicatedPhones.has(phone) || dbPhones.has(phone))) causes.push("TELEFONO_REPETIDO");
    if (name && duplicatedNames.has(normalizeText(name))) causes.push("NOMBRE_SIMILAR");
    if (causes.length === 0) return [];
    return [{ document: text(row.DOCUMENTO), phone: text(row.TELEFONOS_E164 ?? row.TELEFONOS), name, causes }];
  });
  const possibleDuplicateCustomers = customerReview.filter((item) => item.causes.some((cause) => ["DOCUMENTO_REPETIDO", "TELEFONO_REPETIDO"].includes(cause))).length;
  const additionalSimilarNames = customerReview.filter((item) => item.causes.includes("NOMBRE_SIMILAR") && !item.causes.some((cause) => ["DOCUMENTO_REPETIDO", "TELEFONO_REPETIDO"].includes(cause))).length;
  const incompleteCustomers = customerReview.filter((item) => item.causes.some((cause) => cause.startsWith("FALTA_") || cause.startsWith("OTRO"))).length;

  const duplicateSec = duplicateKeys(sales, (row) => text(row.SEC) || null), duplicateSot = duplicateKeys(sales, (row) => text(row.SOT) || null);
  const dbSec = new Set(existingSales.map((item) => text(item.sec)).filter(Boolean)), dbSot = new Set(existingSales.map((item) => text(item.sot)).filter(Boolean));
  const saleBlockers = sales.map((row) => {
    const causes: string[] = [];
    const advisorKey = normalizeAdvisorName(row.ASESOR ?? row.NOMBRE_ASESOR);
    if (advisorStatusByName.get(advisorKey) !== "MAPEAR_A_USUARIO_EXISTENTE") causes.push("ASESOR_SIN_MAPEAR");
    const product = normalizeHistoricalProduct(row.TRANSACCION, row.DETALLE);
    if (product.status !== "MAPPED" || !activeProductCodes.has(product.value)) causes.push("PRODUCTO_PENDIENTE");
    causes.push("PLAN_SIN_MAPEAR");
    if (normalizeSaleStatus(row.STATUS_VENTA).status !== "MAPPED") causes.push("ESTADO_PENDIENTE");
    if (normalizeHistoricalTransactionType(row.TRANSACCION, row.DETALLE).status !== "MAPPED") causes.push("TIPO_OPERACION_PENDIENTE");
    if (!normalizeDocument(row.DNI_CLIENTE_2 ?? row.DNI_CLIENTE) || !text(row.CLIENTE) || !text(row.FECHA_DE_VENTA)) causes.push("DATOS_INCOMPLETOS");
    const sec = text(row.SEC), sot = text(row.SOT);
    if ((sec && (duplicateSec.has(sec) || dbSec.has(sec))) || (sot && (duplicateSot.has(sot) || dbSot.has(sot)))) causes.push("POSIBLE_DUPLICADO");
    return { sourceRow: row.FILA_ORIGEN, causes };
  });
  const blockerCounts = Object.fromEntries(["ASESOR_SIN_MAPEAR", "PLAN_SIN_MAPEAR", "PRODUCTO_PENDIENTE", "ESTADO_PENDIENTE", "TIPO_OPERACION_PENDIENTE", "DATOS_INCOMPLETOS", "POSIBLE_DUPLICADO"].map((cause) => [cause, saleBlockers.filter((item) => item.causes.includes(cause)).length]));

  const after = await databaseCounts();
  assert.deepEqual(after, before, `READ_ONLY_TEST_FAILED: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  const productCreatedAt = [...new Set(databaseProducts.map((item) => item.createdAt.toISOString()))].sort();
  const summary = {
    phase: "3B.1-B.1", mode: "READ_ONLY_MAPPING", generatedAt: new Date().toISOString(), tenant: TENANT,
    productOrigin: { source: "prisma/seed.ts", function: "main", operation: "prisma.product.upsert", catalogSource: "lib/telecom-normalization.ts#YC_PRODUCT_CATALOG", createdAt: productCreatedAt, dryRunWrite: false },
    masterProducts: databaseProducts.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
    plans: { sourceRows: catalogRows.length, grouped: planList.length, uniqueSuggestedMasterPlans: uniqueSuggestedPlans.size, statuses: bucket(planList.map((item) => item.status)) },
    advisors: { historical: advisorMappings.length, statuses: bucket(advisorMappings.map((item) => item.status)) },
    customers: { possibleDuplicates: possibleDuplicateCustomers, additionalSimilarNames, incomplete: incompleteCustomers, reviewRows: customerReview.length },
    sales: { analyzed: sales.length, blocked: saleBlockers.filter((item) => item.causes.length > 0).length, blockerCounts },
    database: { before, after, unchanged: true }, writes: 0,
  };

  const productReport = `# Mapeo de productos\n\n## Origen del catálogo maestro\n\nLos ocho productos fueron creados o actualizados por el seed en \`prisma/seed.ts\`, función \`main()\`, mediante \`prisma.product.upsert\`. El dry-run no los creó: registró Product 8 antes y Product 8 después.\n\n| Código | Nombre | Categoría | Estado | Creado en PostgreSQL |\n|---|---|---|---|---|\n${databaseProducts.map((item) => `| ${md(item.code)} | ${md(item.name)} | ${md(item.category)} | ${item.status} | ${item.createdAt.toISOString()} |`).join("\n")}\n\n## Productos históricos\n\n| Texto histórico | Categoría histórica | Producto normalizado | Apariciones | Estado |\n|---|---|---|---:|---|\n${[...productGroups.values()].sort((a, b) => a.historical.localeCompare(b.historical)).map((item) => `| ${md(item.historical)} | ${md(item.category)} | ${md(item.normalizedProduct)} | ${item.appearances} | ${item.status} |`).join("\n")}\n`;
  const planReport = `# Mapeo de planes comerciales\n\nNo se creó ningún CommercialPlan. Las sugerencias sólo sirven para revisión humana.\n\n| Plan histórico | Producto normalizado | Precio/cargo | Apariciones | Plan maestro sugerido | Estado | Fuente |\n|---|---|---:|---:|---|---|---|\n${planList.map((item) => `| ${md(item.historicalPlan)} | ${md(item.normalizedProduct)} | ${item.detectedPrice?.toFixed(2) ?? ""} | ${item.appearances} | ${md(item.suggestedMasterPlan)} | ${item.status} | ${md([...item.sources].join(", "))} |`).join("\n")}\n`;
  const advisorReport = `# Mapeo de asesores\n\nEl nombre histórico debe conservarse como snapshot aunque no exista un usuario activo. No se creó ningún User.\n\n| Nombre histórico | Ventas | Posible usuario actual | Estado |\n|---|---:|---|---|\n${advisorMappings.sort((a, b) => b.salesCount - a.salesCount).map((item) => `| ${md(item.historicalName)} | ${item.salesCount} | ${md(item.possibleUser)} | ${item.status} |`).join("\n")}\n`;
  const customerReport = `# Revisión de clientes\n\nNo se eliminó ni insertó ningún cliente.\n\n| Documento | Teléfono | Nombre | Causas |\n|---|---|---|---|\n${customerReview.map((item) => `| ${md(item.document)} | ${md(item.phone)} | ${md(item.name)} | ${item.causes.join(", ")} |`).join("\n")}\n`;
  const salesReport = `# Bloqueos de ventas\n\nUna venta puede tener más de una observación.\n\n| Causa | Ventas afectadas |\n|---|---:|\n${Object.entries(blockerCounts).map(([cause, count]) => `| ${cause} | ${count} |`).join("\n")}\n\n## Detalle por fila de origen\n\n| Fila | Observaciones |\n|---:|---|\n${saleBlockers.map((item) => `| ${md(item.sourceRow)} | ${item.causes.join(", ")} |`).join("\n")}\n`;
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "product-mapping.md"), productReport, "utf8"),
    writeFile(path.join(outputDir, "plan-mapping.md"), planReport, "utf8"),
    writeFile(path.join(outputDir, "advisor-mapping.md"), advisorReport, "utf8"),
    writeFile(path.join(outputDir, "customer-review.md"), customerReport, "utf8"),
    writeFile(path.join(outputDir, "sales-blockers.md"), salesReport, "utf8"),
    writeFile(path.join(outputDir, "mapping-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
