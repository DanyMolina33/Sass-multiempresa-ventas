/*
  Warnings:

  - You are about to drop the column `customerId` on the `EconomicRule` table. All the data in the column will be lost.
  - You are about to drop the column `leadId` on the `EconomicRule` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "EconomicRule" DROP CONSTRAINT "EconomicRule_customerId_fkey";

-- DropForeignKey
ALTER TABLE "EconomicRule" DROP CONSTRAINT "EconomicRule_leadId_fkey";

-- AlterTable
ALTER TABLE "EconomicRule" DROP COLUMN "customerId",
DROP COLUMN "leadId";
