CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LimitUnit" AS ENUM ('COUNT', 'SMS', 'MINUTES', 'GIGABYTES');

CREATE TABLE "Tenant" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE', "planId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Plan" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Plan_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Module" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT, "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Module_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TenantModule" ("tenantId" TEXT NOT NULL, "moduleId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "config" JSONB, "activatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("tenantId","moduleId"));
CREATE TABLE "LimitDefinition" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "unit" "LimitUnit" NOT NULL DEFAULT 'COUNT', "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LimitDefinition_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PlanLimit" ("planId" TEXT NOT NULL, "limitId" TEXT NOT NULL, "value" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PlanLimit_pkey" PRIMARY KEY ("planId","limitId"));
CREATE TABLE "TenantLimitOverride" ("tenantId" TEXT NOT NULL, "limitId" TEXT NOT NULL, "value" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TenantLimitOverride_pkey" PRIMARY KEY ("tenantId","limitId"));

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_planId_idx" ON "Tenant"("planId");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE UNIQUE INDEX "Module_code_key" ON "Module"("code");
CREATE INDEX "TenantModule_tenantId_enabled_idx" ON "TenantModule"("tenantId", "enabled");
CREATE INDEX "TenantModule_moduleId_idx" ON "TenantModule"("moduleId");
CREATE UNIQUE INDEX "LimitDefinition_code_key" ON "LimitDefinition"("code");
CREATE INDEX "PlanLimit_limitId_idx" ON "PlanLimit"("limitId");
CREATE INDEX "TenantLimitOverride_limitId_idx" ON "TenantLimitOverride"("limitId");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanLimit" ADD CONSTRAINT "PlanLimit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanLimit" ADD CONSTRAINT "PlanLimit_limitId_fkey" FOREIGN KEY ("limitId") REFERENCES "LimitDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantLimitOverride" ADD CONSTRAINT "TenantLimitOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantLimitOverride" ADD CONSTRAINT "TenantLimitOverride_limitId_fkey" FOREIGN KEY ("limitId") REFERENCES "LimitDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
