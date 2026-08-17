-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PORTABILIDAD_POSTPAGO', 'ALTA_NUEVA_POSTPAGO', 'MIGRACION', 'PREPAGO', 'RENOVACION', 'LINEA_FIJA', 'INTERNET_FIJO', 'OTRO');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('REGISTRADA', 'EN_VALIDACION', 'APROBADA', 'ACTIVADA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "commercialPlanId" TEXT,
    "agentId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "transactionType" "TransactionType" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'REGISTRADA',
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validationDate" TIMESTAMP(3),
    "approvalDate" TIMESTAMP(3),
    "activationDate" TIMESTAMP(3),
    "cancellationDate" TIMESTAMP(3),
    "sec" TEXT,
    "sot" TEXT,
    "msisdn" TEXT,
    "customerDocumentSnapshot" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "planNameSnapshot" TEXT,
    "fixedChargeSnapshot" DECIMAL(12,2),
    "saleAmount" DECIMAL(12,2),
    "salesChannel" TEXT,
    "pointOfSale" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleStatusHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "previousStatus" "SaleStatus",
    "newStatus" "SaleStatus" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_tenantId_sec_idx" ON "Sale"("tenantId", "sec");

-- CreateIndex
CREATE INDEX "Sale_tenantId_sot_idx" ON "Sale"("tenantId", "sot");

-- CreateIndex
CREATE INDEX "Sale_tenantId_msisdn_idx" ON "Sale"("tenantId", "msisdn");

-- CreateIndex
CREATE INDEX "Sale_tenantId_customerId_idx" ON "Sale"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_agentId_idx" ON "Sale"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_status_idx" ON "Sale"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Sale_tenantId_saleDate_idx" ON "Sale"("tenantId", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_tenantId_supervisorId_idx" ON "Sale"("tenantId", "supervisorId");

-- CreateIndex
CREATE INDEX "SaleStatusHistory_tenantId_saleId_changedAt_idx" ON "SaleStatusHistory"("tenantId", "saleId", "changedAt");

-- CreateIndex
CREATE INDEX "SaleStatusHistory_tenantId_newStatus_idx" ON "SaleStatusHistory"("tenantId", "newStatus");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_commercialPlanId_fkey" FOREIGN KEY ("commercialPlanId") REFERENCES "CommercialPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStatusHistory" ADD CONSTRAINT "SaleStatusHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStatusHistory" ADD CONSTRAINT "SaleStatusHistory_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStatusHistory" ADD CONSTRAINT "SaleStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
