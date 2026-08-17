-- CreateEnum
CREATE TYPE "CompensationMode" AS ENUM ('FIJO', 'COMISIONISTA', 'MIXTO');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EN_PLANILLA', 'FUERA_PLANILLA');

-- CreateEnum
CREATE TYPE "CommissionCalculationType" AS ENUM ('FIXED_PER_SALE', 'PERCENTAGE', 'TIERED_BY_SALE_COUNT');

-- CreateEnum
CREATE TYPE "CommissionTierType" AS ENUM ('FIXED_PER_SALE', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "SaleEligibilityCondition" AS ENUM ('SALE_APPROVED', 'SALE_RECOGNIZED');

-- CreateEnum
CREATE TYPE "CompensationComponentRole" AS ENUM ('INCOME', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "PensionRegime" AS ENUM ('NINGUNO', 'ONP', 'AFP');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'REVIEWED', 'CLOSED', 'PAID');

-- CreateEnum
CREATE TYPE "EconomicBase" AS ENUM ('SALE_AMOUNT', 'RECOGNIZED_AMOUNT', 'EXPECTED_COMPANY_INCOME', 'BASE_SALARY', 'GROSS_AMOUNT');

-- CreateTable
CREATE TABLE "JobPosition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PensionRegimeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "regime" "PensionRegime" NOT NULL,
    "name" TEXT NOT NULL,
    "contributionPercentage" DECIMAL(6,3),
    "insurancePercentage" DECIMAL(6,3),
    "commissionPercentage" DECIMAL(6,3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PensionRegimeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" "CompensationMode" NOT NULL,
    "baseSalary" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationCommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compensationPlanId" TEXT NOT NULL,
    "calculationType" "CommissionCalculationType" NOT NULL,
    "eligibility" "SaleEligibilityCondition" NOT NULL,
    "fixedAmountPerSale" DECIMAL(12,2),
    "percentageValue" DECIMAL(6,3),
    "percentageBase" "EconomicBase",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationCommissionTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commissionRuleId" TEXT NOT NULL,
    "minSales" INTEGER NOT NULL,
    "maxSales" INTEGER,
    "tierCalculationType" "CommissionTierType" NOT NULL,
    "fixedAmountPerSale" DECIMAL(12,2),
    "percentageValue" DECIMAL(6,3),
    "percentageBase" "EconomicBase",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compensationPlanId" TEXT NOT NULL,
    "role" "CompensationComponentRole" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calculationType" "EconomicCalculationType" NOT NULL,
    "amount" DECIMAL(12,2),
    "percentageValue" DECIMAL(6,3),
    "percentageBase" "EconomicBase",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "jobPositionId" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "employmentType" "EmploymentType" NOT NULL,
    "compensationPlanId" TEXT NOT NULL,
    "userId" TEXT,
    "pensionRegimeRateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "financeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "compensationPlanId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "eligibleSalesCount" INTEGER,
    "baseSalary" DECIMAL(12,2),
    "commissionAmount" DECIMAL(12,2),
    "bonusAmount" DECIMAL(12,2),
    "mobilityAmount" DECIMAL(12,2),
    "otherIncomeAmount" DECIMAL(12,2),
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "pensionDeduction" DECIMAL(12,2),
    "otherDeductions" DECIMAL(12,2),
    "totalWorkerDeductions" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "employerContributionsAmount" DECIMAL(12,2) NOT NULL,
    "totalCompanyCost" DECIMAL(12,2) NOT NULL,
    "calculationSnapshot" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPosition_tenantId_active_idx" ON "JobPosition"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosition_tenantId_name_key" ON "JobPosition"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PensionRegimeRate_tenantId_regime_active_idx" ON "PensionRegimeRate"("tenantId", "regime", "active");

-- CreateIndex
CREATE INDEX "CompensationPlan_tenantId_active_idx" ON "CompensationPlan"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationPlan_tenantId_code_key" ON "CompensationPlan"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationCommissionRule_compensationPlanId_key" ON "CompensationCommissionRule"("compensationPlanId");

-- CreateIndex
CREATE INDEX "CompensationCommissionRule_tenantId_idx" ON "CompensationCommissionRule"("tenantId");

-- CreateIndex
CREATE INDEX "CompensationCommissionTier_tenantId_commissionRuleId_idx" ON "CompensationCommissionTier"("tenantId", "commissionRuleId");

-- CreateIndex
CREATE INDEX "CompensationComponent_tenantId_compensationPlanId_role_idx" ON "CompensationComponent"("tenantId", "compensationPlanId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_status_idx" ON "Employee"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Employee_tenantId_jobPositionId_idx" ON "Employee"("tenantId", "jobPositionId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_compensationPlanId_idx" ON "Employee"("tenantId", "compensationPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_financeEntryId_key" ON "PayrollPeriod"("financeEntryId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_tenantId_status_idx" ON "PayrollPeriod"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_tenantId_code_key" ON "PayrollPeriod"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PayrollEntry_tenantId_payrollPeriodId_current_idx" ON "PayrollEntry"("tenantId", "payrollPeriodId", "current");

-- CreateIndex
CREATE INDEX "PayrollEntry_tenantId_employeeId_idx" ON "PayrollEntry"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_payrollPeriodId_employeeId_revision_key" ON "PayrollEntry"("payrollPeriodId", "employeeId", "revision");

-- AddForeignKey
ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PensionRegimeRate" ADD CONSTRAINT "PensionRegimeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationPlan" ADD CONSTRAINT "CompensationPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationCommissionRule" ADD CONSTRAINT "CompensationCommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationCommissionRule" ADD CONSTRAINT "CompensationCommissionRule_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId") REFERENCES "CompensationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationCommissionTier" ADD CONSTRAINT "CompensationCommissionTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationCommissionTier" ADD CONSTRAINT "CompensationCommissionTier_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CompensationCommissionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationComponent" ADD CONSTRAINT "CompensationComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationComponent" ADD CONSTRAINT "CompensationComponent_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId") REFERENCES "CompensationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "JobPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId") REFERENCES "CompensationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pensionRegimeRateId_fkey" FOREIGN KEY ("pensionRegimeRateId") REFERENCES "PensionRegimeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId") REFERENCES "CompensationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
