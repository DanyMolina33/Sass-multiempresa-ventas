import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type SaleStatus, type TransactionType } from "@prisma/client";

const TENANT = { id: "cmrs70rk10019g4unlgr14mmj", slug: "yc-telecomunicaciones", name: "YC Telecomunicaciones" } as const;
const BATCH_CODE = "YC_PILOT_INITIAL_IMPORT";
const pilotDir = path.resolve("private/imports/yc-telecomunicaciones/pilot");
const reportDir = path.resolve("private/imports/yc-telecomunicaciones/import");
const summaryPath = path.join(reportDir, "pilot-import-summary.json");
const requiredFiles = ["pilot-customers.json", "pilot-sales.json", "pilot-products.json", "pilot-plans.json", "pilot-operations.json", "pilot-summary.json", "pilot-report.md"] as const;
const allowedOperations = new Set(["PORTABILIDAD", "MIGRACION", "RENOVACION", "ALTA_NUEVA"]);
const allowedStatuses = new Set(["REGISTRADA", "EN_VALIDACION", "APROBADA", "ACTIVADA", "RECHAZADA", "CANCELADA"]);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type PilotCustomer = { document: string; name: string; phone: string; disposition: string };
type PilotProduct = { code: string; name: string };
type PilotPlan = { code: string; name: string; productCode: string; price: number; classification: string };
type PilotOperation = { code: string };
type PilotSale = {
  sourceRow: number; customerDocument: string; customerName: string; productCode: string; operationCode: string; planCode: string;
  planPrice: number; saleDate: string; status: SaleStatus; historicalAdvisorName: string | null; assignedUserId: null;
  sec: string | null; sot: string | null; msisdn: string | null; source: string; disposition: string; reasons: unknown[];
};
type DbCounts = { customers: number; sales: number; products: number; commercialPlans: number; users: number };
const stableId = (prefix: string, value: string) => `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
const customerKey = (document: string) => `${BATCH_CODE}:CUSTOMER:${document}`;
const saleKey = (sale: PilotSale) => `${BATCH_CODE}:SALE:${sale.sourceRow}:${createHash("sha256").update([sale.customerDocument, sale.productCode, sale.operationCode, sale.planCode, sale.saleDate, sale.sec, sale.sot, sale.msisdn].join("|")).digest("hex").slice(0, 20)}`;
const readJson = async <T>(name: string) => JSON.parse(await readFile(path.join(pilotDir, name), "utf8")) as T;
const countsForTenant = async (tenantId: string): Promise<DbCounts> => ({
  customers: await prisma.customer.count({ where: { tenantId } }), sales: await prisma.sale.count({ where: { tenantId } }),
  products: await prisma.product.count({ where: { tenantId } }), commercialPlans: await prisma.commercialPlan.count({ where: { tenantId } }),
  users: await prisma.user.count({ where: { tenantId } }),
});

async function loadAndValidate() {
  for (const name of requiredFiles) await access(path.join(pilotDir, name));
  const [customers, sales, products, plans, operations, pilotSummary] = await Promise.all([
    readJson<PilotCustomer[]>("pilot-customers.json"), readJson<PilotSale[]>("pilot-sales.json"), readJson<PilotProduct[]>("pilot-products.json"),
    readJson<PilotPlan[]>("pilot-plans.json"), readJson<PilotOperation[]>("pilot-operations.json"), readJson<Record<string, unknown>>("pilot-summary.json"),
  ]);
  assert.equal(customers.length, 888, "PILOT_CUSTOMER_COUNT_INVALID");
  assert.equal(sales.length, 767, "PILOT_SALE_COUNT_INVALID");
  assert.equal(products.length, 6, "PILOT_PRODUCT_COUNT_INVALID");
  assert.equal(plans.length, 12, "PILOT_PLAN_COUNT_INVALID");
  assert.deepEqual(new Set(operations.map((item) => item.code)), allowedOperations, "PILOT_OPERATIONS_INVALID");
  const customerByDocument = new Map(customers.map((item) => [item.document, item]));
  const productByCode = new Map(products.map((item) => [item.code, item]));
  const planByCode = new Map(plans.map((item) => [item.code, item]));
  assert.equal(customerByDocument.size, customers.length, "DUPLICATE_PILOT_CUSTOMER_DOCUMENT");
  assert.equal(new Set(sales.map((item) => saleKey(item))).size, sales.length, "DUPLICATE_PILOT_SALE_KEY");
  for (const plan of plans) {
    assert.equal(plan.classification, "PLAN_MAESTRO_VALIDO", `PLAN_NOT_VALID:${plan.code}`);
    assert.ok(productByCode.has(plan.productCode), `PLAN_PRODUCT_MISSING:${plan.code}`);
    assert.ok(Number.isFinite(plan.price) && plan.price > 0, `PLAN_PRICE_INVALID:${plan.code}`);
  }
  for (const sale of sales) {
    assert.equal(sale.disposition, "LISTA_PARA_PILOTO", `SALE_NOT_READY:${sale.sourceRow}`);
    assert.deepEqual(sale.reasons, [], `SALE_HAS_REASONS:${sale.sourceRow}`);
    assert.ok(customerByDocument.has(sale.customerDocument), `SALE_CUSTOMER_MISSING:${sale.sourceRow}`);
    assert.ok(productByCode.has(sale.productCode), `SALE_PRODUCT_MISSING:${sale.sourceRow}`);
    assert.ok(planByCode.has(sale.planCode), `SALE_PLAN_MISSING:${sale.sourceRow}`);
    assert.equal(planByCode.get(sale.planCode)?.productCode, sale.productCode, `SALE_PLAN_PRODUCT_MISMATCH:${sale.sourceRow}`);
    assert.ok(allowedOperations.has(sale.operationCode), `SALE_OPERATION_INVALID:${sale.sourceRow}`);
    assert.ok(allowedStatuses.has(sale.status), `SALE_STATUS_INVALID:${sale.sourceRow}`);
    assert.ok(!Number.isNaN(new Date(sale.saleDate).getTime()), `SALE_DATE_INVALID:${sale.sourceRow}`);
    assert.ok(sale.sec || sale.sot || sale.msisdn, `SALE_IDENTIFIERS_MISSING:${sale.sourceRow}`);
    assert.equal(sale.assignedUserId, null, `SALE_ASSIGNED_USER_NOT_NULL:${sale.sourceRow}`);
  }
  const requiredDocuments = new Set(sales.map((item) => item.customerDocument));
  const requiredCustomers = customers.filter((item) => requiredDocuments.has(item.document));
  assert.equal(requiredCustomers.length, requiredDocuments.size, "REQUIRED_CUSTOMER_SET_INCOMPLETE");
  return { customers, requiredCustomers, sales, products, plans, operations, pilotSummary };
}

async function verifyImportedState(batchId: string, requiredCustomerCount: number, saleCount: number) {
  const [batchCustomers, batchSales, orphanSales, wrongTenantPlans, renewalProducts, missingHistoricalAdvisor] = await Promise.all([
    prisma.customer.count({ where: { tenantId: TENANT.id, importBatchId: batchId } }),
    prisma.sale.count({ where: { tenantId: TENANT.id, importBatchId: batchId } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Sale" s LEFT JOIN "Customer" c ON c.id=s."customerId" WHERE s."tenantId"=${TENANT.id} AND c.id IS NULL`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CommercialPlan" p JOIN "Product" pr ON pr.id=p."productId" WHERE p."tenantId"=${TENANT.id} AND pr."tenantId"<>${TENANT.id}`,
    prisma.sale.count({ where: { tenantId: TENANT.id, importBatchId: batchId, product: { code: "RENOVACION" } } }),
    prisma.sale.count({ where: { tenantId: TENANT.id, importBatchId: batchId, historicalAdvisorName: null } }),
  ]);
  assert.equal(batchCustomers, requiredCustomerCount, "IMPORTED_CUSTOMER_COUNT_MISMATCH");
  assert.equal(batchSales, saleCount, "IMPORTED_SALE_COUNT_MISMATCH");
  assert.equal(Number(orphanSales[0].count), 0, "ORPHAN_SALES_FOUND");
  assert.equal(Number(wrongTenantPlans[0].count), 0, "CROSS_TENANT_PLAN_PRODUCT_FOUND");
  assert.equal(renewalProducts, 0, "RENOVACION_USED_AS_PRODUCT");
  assert.equal(missingHistoricalAdvisor, 0, "HISTORICAL_ADVISOR_NOT_PRESERVED");
}

async function saveReport(summary: Record<string, unknown>) {
  const report = `# Importación piloto YC Telecomunicaciones\n\n- Lote: **${BATCH_CODE}**\n- Tenant: ${TENANT.name} (\`${TENANT.slug}\`)\n- Fecha: ${summary.generatedAt}\n- Clientes piloto disponibles: ${summary.customersAvailable}\n- Clientes requeridos: ${summary.customersRequired}\n- Clientes insertados en primera ejecución: ${summary.customersInserted}\n- Ventas piloto disponibles: ${summary.salesAvailable}\n- Ventas insertadas en primera ejecución: ${summary.salesInserted}\n- Ventas rechazadas durante importación: ${summary.salesRejected}\n- Productos utilizados: ${(summary.productsUsed as string[]).join(", ")}\n- Planes finales: ${summary.plansFinal}\n- Operaciones: ${(summary.operationsUsed as string[]).join(", ")}\n- Ventas con asesor histórico: ${summary.salesWithHistoricalAdvisor}\n- Usuarios creados: ${summary.usersCreated}\n- Errores: ${summary.errors}\n- Conteos antes: \`${JSON.stringify(summary.countsBefore)}\`\n- Conteos después: \`${JSON.stringify(summary.countsAfter)}\`\n- Idempotencia: ${JSON.stringify(summary.idempotency)}\n- Clínica Demo sin cambios: **${summary.clinicUnchanged ? "SÍ" : "NO"}**\n\n**FASE 3B.1-C — IMPORTACIÓN PILOTO COMPLETADA.**\n`;
  await mkdir(reportDir, { recursive: true });
  await Promise.all([writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"), writeFile(path.join(reportDir, "pilot-import-report.md"), report, "utf8")]);
}

async function main() {
  const dataset = await loadAndValidate();
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT.slug } });
  assert.ok(tenant && tenant.id === TENANT.id && tenant.status === "ACTIVE", "YC_TENANT_NOT_ACTIVE_OR_INVALID");
  const clinic = await prisma.tenant.findUniqueOrThrow({ where: { slug: "clinica-demo" } });
  const countsBefore = await countsForTenant(TENANT.id), clinicBefore = await countsForTenant(clinic.id);
  let previousSummary: Record<string, unknown> | null = null;
  try { previousSummary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>; } catch { previousSummary = null; }
  const existingBatch = await prisma.importBatch.findUnique({ where: { tenantId_code: { tenantId: TENANT.id, code: BATCH_CODE } } });
  if (existingBatch?.status === "COMPLETED") {
    await verifyImportedState(existingBatch.id, dataset.requiredCustomers.length, dataset.sales.length);
    const countsAfter = await countsForTenant(TENANT.id), clinicAfter = await countsForTenant(clinic.id);
    assert.deepEqual(clinicAfter, clinicBefore, "CLINIC_CHANGED_DURING_IDEMPOTENCY_RUN");
    const summary = {
      ...(previousSummary ?? {}), generatedAt: new Date().toISOString(), batchId: existingBatch.id, batchCode: BATCH_CODE, tenant: TENANT,
      customersAvailable: dataset.customers.length, customersRequired: dataset.requiredCustomers.length,
      customersInserted: existingBatch.customersInserted, salesAvailable: dataset.sales.length, salesInserted: existingBatch.salesInserted,
      salesRejected: 0, productsUsed: [...new Set(dataset.sales.map((item) => item.productCode))], plansFinal: dataset.plans.length,
      operationsUsed: [...new Set(dataset.sales.map((item) => item.operationCode))].sort(), salesWithHistoricalAdvisor: dataset.sales.filter((item) => item.historicalAdvisorName).length,
      usersCreated: 0, errors: 0, countsBefore: previousSummary?.countsBefore ?? countsBefore, countsAfter,
      clinicBefore: previousSummary?.clinicBefore ?? clinicBefore, clinicAfter, clinicUnchanged: true,
      idempotency: { passed: true, customersInsertedSecondRun: 0, salesInsertedSecondRun: 0, productsInsertedSecondRun: 0, plansInsertedSecondRun: 0 },
    };
    await saveReport(summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  assert.equal(existingBatch, null, `BATCH_NOT_COMPLETED:${existingBatch?.status}`);
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: "admin@yctelecom.test" } });
  assert.equal(actor.tenantId, TENANT.id, "IMPORT_ACTOR_WRONG_TENANT");
  const existingPlanCodes = new Set((await prisma.commercialPlan.findMany({ where: { tenantId: TENANT.id }, select: { code: true } })).map((item) => item.code));
  const existingCustomerKeys = new Set((await prisma.customer.findMany({ where: { tenantId: TENANT.id, sourceRecordKey: { not: null } }, select: { sourceRecordKey: true } })).map((item) => item.sourceRecordKey));
  const existingSaleKeys = new Set((await prisma.sale.findMany({ where: { tenantId: TENANT.id, sourceRecordKey: { not: null } }, select: { sourceRecordKey: true } })).map((item) => item.sourceRecordKey));
  assert.equal(existingCustomerKeys.size, 0, "UNEXPECTED_PREEXISTING_IMPORTED_CUSTOMERS");
  assert.equal(existingSaleKeys.size, 0, "UNEXPECTED_PREEXISTING_IMPORTED_SALES");

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({ data: { tenantId: TENANT.id, code: BATCH_CODE, importType: "PILOT_COMMERCIAL_HISTORY", sourceName: "pilot/*.json", customersProcessed: dataset.requiredCustomers.length, salesProcessed: dataset.sales.length } });
    const postpaid = await tx.product.findUnique({ where: { tenantId_code: { tenantId: TENANT.id, code: "POSTPAGO" } } });
    const prepaid = await tx.product.findUnique({ where: { tenantId_code: { tenantId: TENANT.id, code: "PREPAGO" } } });
    assert.ok(postpaid && prepaid, "SEED_MOBILE_PRODUCTS_MISSING");
    await tx.product.update({ where: { id: postpaid.id }, data: { code: "MOVIL_POSTPAGO", name: "Móvil postpago", category: "MOVIL_POSTPAGO", status: "ACTIVE" } });
    await tx.product.update({ where: { id: prepaid.id }, data: { code: "MOVIL_PREPAGO", name: "Móvil prepago", category: "MOVIL_PREPAGO", status: "ACTIVE" } });
    await tx.product.updateMany({ where: { tenantId: TENANT.id, code: "RENOVACION" }, data: { status: "INACTIVE" } });
    const dbProducts = await tx.product.findMany({ where: { tenantId: TENANT.id } });
    const productByCode = new Map(dbProducts.map((item) => [item.code, item]));
    for (const product of dataset.products) assert.ok(productByCode.has(product.code), `MASTER_PRODUCT_MISSING:${product.code}`);
    for (const plan of dataset.plans) {
      const product = productByCode.get(plan.productCode);
      assert.ok(product, `PLAN_PRODUCT_NOT_FOUND:${plan.code}`);
      await tx.commercialPlan.upsert({
        where: { tenantId_code: { tenantId: TENANT.id, code: plan.code } },
        update: { productId: product.id, name: plan.name, price: plan.price, fixedCharge: plan.price, status: "ACTIVE" },
        create: { tenantId: TENANT.id, productId: product.id, code: plan.code, name: plan.name, price: plan.price, fixedCharge: plan.price, status: "ACTIVE" },
      });
    }
    const dbPlans = await tx.commercialPlan.findMany({ where: { tenantId: TENANT.id, code: { in: dataset.plans.map((item) => item.code) } } });
    const planByCode = new Map(dbPlans.map((item) => [item.code, item]));
    const customerData = dataset.requiredCustomers.map((customer) => ({
      id: stableId("ycpc", customer.document), tenantId: TENANT.id, name: customer.name, document: customer.document, phone: customer.phone,
      sourceRecordKey: customerKey(customer.document), importBatchId: batch.id,
    }));
    await tx.customer.createMany({ data: customerData });
    const customerByDocument = new Map(customerData.map((item) => [item.document, item]));
    const saleData = dataset.sales.map((sale) => {
      const customer = customerByDocument.get(sale.customerDocument), product = productByCode.get(sale.productCode), plan = planByCode.get(sale.planCode);
      assert.ok(customer && product && plan && plan.productId === product.id, `SALE_RELATION_INVALID:${sale.sourceRow}`);
      return {
        id: stableId("ycps", saleKey(sale)), tenantId: TENANT.id, customerId: customer.id, productId: product.id, commercialPlanId: plan.id,
        agentId: null, supervisorId: null, transactionType: sale.operationCode as TransactionType, status: sale.status, saleDate: new Date(sale.saleDate),
        sec: sale.sec, sot: sale.sot, msisdn: sale.msisdn, customerDocumentSnapshot: sale.customerDocument, customerNameSnapshot: sale.customerName,
        productNameSnapshot: product.name, planNameSnapshot: plan.name, fixedChargeSnapshot: plan.fixedCharge, saleAmount: plan.price,
        source: sale.source, historicalAdvisorName: sale.historicalAdvisorName, sourceRecordKey: saleKey(sale), importBatchId: batch.id, createdByUserId: actor.id,
      };
    });
    await tx.sale.createMany({ data: saleData });
    await tx.saleStatusHistory.createMany({ data: saleData.map((sale) => ({ tenantId: TENANT.id, saleId: sale.id, previousStatus: null, newStatus: sale.status, changedByUserId: actor.id, reason: `Importación ${BATCH_CODE}` })) });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", customersInserted: customerData.length, salesInserted: saleData.length, errorCount: 0, finishedAt: new Date() } });
    return { batchId: batch.id, customersInserted: customerData.length, salesInserted: saleData.length, plansInserted: dataset.plans.filter((item) => !existingPlanCodes.has(item.code)).length };
  }, { timeout: 120_000 });
  await verifyImportedState(result.batchId, dataset.requiredCustomers.length, dataset.sales.length);
  const countsAfter = await countsForTenant(TENANT.id), clinicAfter = await countsForTenant(clinic.id);
  assert.deepEqual(clinicAfter, clinicBefore, "CLINIC_CHANGED_DURING_IMPORT");
  const summary = {
    generatedAt: new Date().toISOString(), batchId: result.batchId, batchCode: BATCH_CODE, tenant: TENANT,
    customersAvailable: dataset.customers.length, customersRequired: dataset.requiredCustomers.length, customersInserted: result.customersInserted,
    salesAvailable: dataset.sales.length, salesInserted: result.salesInserted, salesRejected: 0,
    productsUsed: [...new Set(dataset.sales.map((item) => item.productCode))], plansFinal: dataset.plans.length, plansInserted: result.plansInserted,
    operationsUsed: [...new Set(dataset.sales.map((item) => item.operationCode))].sort(), salesWithHistoricalAdvisor: dataset.sales.filter((item) => item.historicalAdvisorName).length,
    usersCreated: countsAfter.users - countsBefore.users, errors: 0, countsBefore, countsAfter, clinicBefore, clinicAfter, clinicUnchanged: true,
    idempotency: { passed: false, pendingSecondRun: true },
  };
  await saveReport(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
