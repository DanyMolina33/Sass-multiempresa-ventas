-- CreateEnum
CREATE TYPE "FinanceEntryType" AS ENUM ('INGRESO', 'GASTO');

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "FinanceEntryType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "FinanceEntryType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "notes" TEXT,
    "documentName" TEXT,
    "documentReference" TEXT,
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceCategory_tenantId_type_active_idx" ON "FinanceCategory"("tenantId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_tenantId_type_name_key" ON "FinanceCategory"("tenantId", "type", "name");

-- CreateIndex
CREATE INDEX "FinanceEntry_tenantId_type_entryDate_idx" ON "FinanceEntry"("tenantId", "type", "entryDate");

-- CreateIndex
CREATE INDEX "FinanceEntry_tenantId_categoryId_idx" ON "FinanceEntry"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "FinanceEntry_tenantId_registeredByUserId_idx" ON "FinanceEntry"("tenantId", "registeredByUserId");

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
