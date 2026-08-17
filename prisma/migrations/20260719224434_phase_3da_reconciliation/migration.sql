-- CreateEnum
CREATE TYPE "ReconciliationImportStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationMatchStatus" AS ENUM ('MATCHED', 'POSSIBLE_MATCH', 'NOT_FOUND_IN_OPERATOR', 'EXTERNAL_ONLY', 'DUPLICATE_EXTERNAL', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "ReconciliationResultStatus" AS ENUM ('CONFORME', 'DIFERENCIA', 'NO_LIQUIDADO', 'PENDIENTE', 'NO_ENCONTRADO', 'REQUIERE_REVISION');

-- CreateTable
CREATE TABLE "SettlementProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "status" "ReconciliationImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "detectedColumns" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "differenceCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "externalOnlyCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationStagingRow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "providerReference" TEXT,
    "sec" TEXT,
    "sot" TEXT,
    "phone" TEXT,
    "document" TEXT,
    "customerName" TEXT,
    "saleDate" TIMESTAMP(3),
    "recognizedAmount" DECIMAL(14,4),
    "rawData" JSONB NOT NULL,
    "matchStatus" "ReconciliationMatchStatus" NOT NULL,
    "matchedSaleId" TEXT,
    "matchedBy" TEXT,

    CONSTRAINT "ReconciliationStagingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "stagingRowId" TEXT,
    "saleId" TEXT,
    "providerReference" TEXT,
    "expectedAmount" DECIMAL(14,4),
    "recognizedAmount" DECIMAL(14,4),
    "differenceAmount" DECIMAL(14,4),
    "status" "ReconciliationResultStatus" NOT NULL,
    "matchStatus" "ReconciliationMatchStatus" NOT NULL,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementProvider_tenantId_active_idx" ON "SettlementProvider"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProvider_tenantId_code_key" ON "SettlementProvider"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ReconciliationImport_tenantId_period_status_idx" ON "ReconciliationImport"("tenantId", "period", "status");

-- CreateIndex
CREATE INDEX "ReconciliationImport_tenantId_providerId_idx" ON "ReconciliationImport"("tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationImport_tenantId_fileHash_key" ON "ReconciliationImport"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "ReconciliationStagingRow_tenantId_reconciliationId_matchSta_idx" ON "ReconciliationStagingRow"("tenantId", "reconciliationId", "matchStatus");

-- CreateIndex
CREATE INDEX "ReconciliationStagingRow_tenantId_sec_idx" ON "ReconciliationStagingRow"("tenantId", "sec");

-- CreateIndex
CREATE INDEX "ReconciliationStagingRow_tenantId_sot_idx" ON "ReconciliationStagingRow"("tenantId", "sot");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationStagingRow_reconciliationId_rowNumber_key" ON "ReconciliationStagingRow"("reconciliationId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationResult_stagingRowId_key" ON "ReconciliationResult"("stagingRowId");

-- CreateIndex
CREATE INDEX "ReconciliationResult_tenantId_reconciliationId_status_idx" ON "ReconciliationResult"("tenantId", "reconciliationId", "status");

-- CreateIndex
CREATE INDEX "ReconciliationResult_tenantId_saleId_idx" ON "ReconciliationResult"("tenantId", "saleId");

-- AddForeignKey
ALTER TABLE "SettlementProvider" ADD CONSTRAINT "SettlementProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SettlementProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationStagingRow" ADD CONSTRAINT "ReconciliationStagingRow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationStagingRow" ADD CONSTRAINT "ReconciliationStagingRow_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "ReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "ReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_stagingRowId_fkey" FOREIGN KEY ("stagingRowId") REFERENCES "ReconciliationStagingRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
