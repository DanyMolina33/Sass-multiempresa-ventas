ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'PORTABILIDAD';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'ALTA_NUEVA';

CREATE TYPE "ImportBatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'RUNNING',
    "customersProcessed" INTEGER NOT NULL DEFAULT 0,
    "customersInserted" INTEGER NOT NULL DEFAULT 0,
    "salesProcessed" INTEGER NOT NULL DEFAULT 0,
    "salesInserted" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Customer" ADD COLUMN "sourceRecordKey" TEXT;
ALTER TABLE "Customer" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "Sale" ALTER COLUMN "agentId" DROP NOT NULL;
ALTER TABLE "Sale" ADD COLUMN "historicalAdvisorName" TEXT;
ALTER TABLE "Sale" ADD COLUMN "historicalSupervisorName" TEXT;
ALTER TABLE "Sale" ADD COLUMN "sourceRecordKey" TEXT;
ALTER TABLE "Sale" ADD COLUMN "importBatchId" TEXT;

CREATE UNIQUE INDEX "ImportBatch_tenantId_code_key" ON "ImportBatch"("tenantId", "code");
CREATE INDEX "ImportBatch_tenantId_status_idx" ON "ImportBatch"("tenantId", "status");
CREATE UNIQUE INDEX "Customer_tenantId_sourceRecordKey_key" ON "Customer"("tenantId", "sourceRecordKey");
CREATE INDEX "Customer_tenantId_importBatchId_idx" ON "Customer"("tenantId", "importBatchId");
CREATE UNIQUE INDEX "Sale_tenantId_sourceRecordKey_key" ON "Sale"("tenantId", "sourceRecordKey");
CREATE INDEX "Sale_tenantId_importBatchId_idx" ON "Sale"("tenantId", "importBatchId");

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_agentId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
