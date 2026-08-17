-- DropIndex (drop the old one-directional pointer from PayrollPeriod to FinanceEntry)
DROP INDEX IF EXISTS "PayrollPeriod_financeEntryId_key";

-- AlterTable
ALTER TABLE "PayrollPeriod" DROP COLUMN "financeEntryId";

-- AlterTable (proper FK from FinanceEntry back to its originating PayrollPeriod)
ALTER TABLE "FinanceEntry" ADD COLUMN "payrollPeriodId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_payrollPeriodId_key" ON "FinanceEntry"("payrollPeriodId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
