import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const tenantId = "cmrs70rk10019g4unlgr14mmj";
async function main() {
  const summary = JSON.parse(await readFile(path.resolve("private/imports/yc-telecomunicaciones/import/pilot-import-summary.json"), "utf8")) as { batchId: string; clinicUnchanged: boolean; idempotency: { passed: boolean }; customersRequired: number; salesAvailable: number; usersCreated: number };
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: summary.batchId } });
  assert.equal(batch.status, "COMPLETED");
  assert.equal(batch.customersInserted, summary.customersRequired);
  assert.equal(batch.salesInserted, summary.salesAvailable);
  assert.equal(await prisma.customer.count({ where: { tenantId, importBatchId: batch.id } }), 731);
  assert.equal(await prisma.sale.count({ where: { tenantId, importBatchId: batch.id } }), 767);
  assert.equal(await prisma.commercialPlan.count({ where: { tenantId } }), 12);
  assert.equal(await prisma.sale.count({ where: { tenantId, importBatchId: batch.id, agentId: { not: null } } }), 0);
  assert.equal(await prisma.sale.count({ where: { tenantId, importBatchId: batch.id, historicalAdvisorName: null } }), 0);
  assert.equal(await prisma.sale.count({ where: { tenantId, importBatchId: batch.id, product: { code: "RENOVACION" } } }), 0);
  assert.equal(await prisma.product.count({ where: { tenantId, code: "RENOVACION", status: "INACTIVE" } }), 1);
  assert.equal(await prisma.sale.count({ where: { tenantId, importBatchId: batch.id, transactionType: "RENOVACION" } }), 24);
  assert.equal(summary.usersCreated, 0);
  assert.equal(summary.clinicUnchanged, true);
  assert.equal(summary.idempotency.passed, true);
  console.log(JSON.stringify({ batchCompleted: true, customers: 731, sales: 767, plans: 12, nullableAgentSupported: true, historicalAdvisorsPreserved: true, renewalIsOperation: true, usersCreated: 0, clinicUnchanged: true, idempotencyPassed: true }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
