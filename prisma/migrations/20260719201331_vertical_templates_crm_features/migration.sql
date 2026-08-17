-- CreateTable
CREATE TABLE "VerticalTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerticalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerticalTemplateFeature" (
    "id" TEXT NOT NULL,
    "verticalTemplateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerticalTemplateFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantVerticalTemplate" (
    "tenantId" TEXT NOT NULL,
    "verticalTemplateId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantVerticalTemplate_pkey" PRIMARY KEY ("tenantId","verticalTemplateId")
);

-- CreateTable
CREATE TABLE "TenantCrmFeature" (
    "tenantId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCrmFeature_pkey" PRIMARY KEY ("tenantId","featureId")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerticalTemplate_code_key" ON "VerticalTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VerticalTemplateFeature_verticalTemplateId_code_key" ON "VerticalTemplateFeature"("verticalTemplateId", "code");

-- CreateIndex
CREATE INDEX "TenantVerticalTemplate_verticalTemplateId_idx" ON "TenantVerticalTemplate"("verticalTemplateId");

-- CreateIndex
CREATE INDEX "TenantCrmFeature_featureId_idx" ON "TenantCrmFeature"("featureId");

-- AddForeignKey
ALTER TABLE "VerticalTemplateFeature" ADD CONSTRAINT "VerticalTemplateFeature_verticalTemplateId_fkey" FOREIGN KEY ("verticalTemplateId") REFERENCES "VerticalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantVerticalTemplate" ADD CONSTRAINT "TenantVerticalTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantVerticalTemplate" ADD CONSTRAINT "TenantVerticalTemplate_verticalTemplateId_fkey" FOREIGN KEY ("verticalTemplateId") REFERENCES "VerticalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCrmFeature" ADD CONSTRAINT "TenantCrmFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCrmFeature" ADD CONSTRAINT "TenantCrmFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "VerticalTemplateFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
