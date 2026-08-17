-- CreateEnum
CREATE TYPE "EconomicCalculationType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "EconomicCalculationStatus" AS ENUM ('CALCULATED', 'PENDING_RULE', 'PENDING_ASSIGNMENT', 'REQUIRES_REVIEW');

-- CreateTable
CREATE TABLE "EconomicRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT,
    "commercialPlanId" TEXT,
    "transactionType" "TransactionType",
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expectedCompanyIncomeType" "EconomicCalculationType",
    "expectedCompanyIncomeValue" DECIMAL(14,4),
    "promoterCommissionType" "EconomicCalculationType",
    "promoterCommissionValue" DECIMAL(14,4),
    "supervisorCommissionType" "EconomicCalculationType",
    "supervisorCommissionValue" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT,

    CONSTRAINT "EconomicRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleEconomicCalculation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "economicRuleId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "expectedCompanyIncome" DECIMAL(14,4),
    "promoterCommission" DECIMAL(14,4),
    "supervisorCommission" DECIMAL(14,4),
    "preliminaryMargin" DECIMAL(14,4),
    "calculationStatus" "EconomicCalculationStatus" NOT NULL,
    "promoterUserId" TEXT,
    "supervisorUserId" TEXT,
    "historicalAdvisorName" TEXT,
    "historicalSupervisorName" TEXT,
    "ruleSnapshot" JSONB,
    "inputSnapshot" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "SaleEconomicCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EconomicRule_tenantId_active_effectiveFrom_effectiveTo_idx" ON "EconomicRule"("tenantId", "active", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "EconomicRule_tenantId_productId_commercialPlanId_transactio_idx" ON "EconomicRule"("tenantId", "productId", "commercialPlanId", "transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "EconomicRule_tenantId_code_key" ON "EconomicRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SaleEconomicCalculation_tenantId_calculationStatus_idx" ON "SaleEconomicCalculation"("tenantId", "calculationStatus");

-- CreateIndex
CREATE INDEX "SaleEconomicCalculation_tenantId_saleId_current_idx" ON "SaleEconomicCalculation"("tenantId", "saleId", "current");

-- CreateIndex
CREATE INDEX "SaleEconomicCalculation_tenantId_economicRuleId_idx" ON "SaleEconomicCalculation"("tenantId", "economicRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleEconomicCalculation_saleId_revision_key" ON "SaleEconomicCalculation"("saleId", "revision");

-- AddForeignKey
ALTER TABLE "EconomicRule" ADD CONSTRAINT "EconomicRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicRule" ADD CONSTRAINT "EconomicRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicRule" ADD CONSTRAINT "EconomicRule_commercialPlanId_fkey" FOREIGN KEY ("commercialPlanId") REFERENCES "CommercialPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicRule" ADD CONSTRAINT "EconomicRule_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicRule" ADD CONSTRAINT "EconomicRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEconomicCalculation" ADD CONSTRAINT "SaleEconomicCalculation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEconomicCalculation" ADD CONSTRAINT "SaleEconomicCalculation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEconomicCalculation" ADD CONSTRAINT "SaleEconomicCalculation_economicRuleId_fkey" FOREIGN KEY ("economicRuleId") REFERENCES "EconomicRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEconomicCalculation" ADD CONSTRAINT "SaleEconomicCalculation_promoterUserId_fkey" FOREIGN KEY ("promoterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEconomicCalculation" ADD CONSTRAINT "SaleEconomicCalculation_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
