-- Supervisor Portal V1 + Module Entitlements — additive only.
-- Applied directly via psql (not `prisma migrate dev`) due to the pre-existing drift documented in
-- .claude/skills/mentorify-promoter-portal/references/CURRENT_STATE.md (10 migrations applied to the live DB but
-- absent from this working tree). This file exists so the change is reproducible/reviewable even though it wasn't
-- run through the normal `migrate dev` flow. Rollback: drop the two new tables, the two new columns, and the four
-- new enums, in reverse order below.
--
-- NOTE: ActionPlan/ActionPlanOrigin/ActionPlanPriority/ActionPlanStatus/ActionPlanScopeType already exist in the
-- live database (migration 20260722224500_action_plans_block1, also outside this working tree's history) and are
-- NOT created here — only newly modeled in prisma/schema.prisma as a partial model, same treatment as CommercialGoal.

ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Employee" ADD COLUMN "commercialCode" TEXT;
CREATE UNIQUE INDEX "Employee_tenantId_commercialCode_key" ON "Employee"("tenantId", "commercialCode");

CREATE TABLE "UserModuleGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserModuleGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserModuleGrant_userId_moduleId_key" ON "UserModuleGrant"("userId", "moduleId");
CREATE INDEX "UserModuleGrant_tenantId_userId_idx" ON "UserModuleGrant"("tenantId", "userId");
ALTER TABLE "UserModuleGrant" ADD CONSTRAINT "UserModuleGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserModuleGrant" ADD CONSTRAINT "UserModuleGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserModuleGrant" ADD CONSTRAINT "UserModuleGrant_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "InternalMessageKind" AS ENUM ('MESSAGE', 'CAMPAIGN');
CREATE TYPE "InternalMessageType" AS ENUM ('MOTIVATIONAL', 'INFORMATIVE', 'RECOGNITION', 'URGENT');
CREATE TYPE "InternalMessageCta" AS ENUM ('NONE', 'GOAL', 'RANKING', 'SALE');
CREATE TYPE "InternalMessageStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'FINISHED', 'CANCELLED');

CREATE TABLE "InternalMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "kind" "InternalMessageKind" NOT NULL DEFAULT 'MESSAGE',
    "type" "InternalMessageType" NOT NULL DEFAULT 'INFORMATIVE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" "InternalMessageCta" NOT NULL DEFAULT 'NONE',
    "status" "InternalMessageStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalMessage_tenantId_fromUserId_idx" ON "InternalMessage"("tenantId", "fromUserId");
CREATE INDEX "InternalMessage_tenantId_status_idx" ON "InternalMessage"("tenantId", "status");
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InternalMessageRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalMessageRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InternalMessageRecipient_messageId_userId_key" ON "InternalMessageRecipient"("messageId", "userId");
CREATE INDEX "InternalMessageRecipient_tenantId_userId_readAt_idx" ON "InternalMessageRecipient"("tenantId", "userId", "readAt");
ALTER TABLE "InternalMessageRecipient" ADD CONSTRAINT "InternalMessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InternalMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalMessageRecipient" ADD CONSTRAINT "InternalMessageRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
