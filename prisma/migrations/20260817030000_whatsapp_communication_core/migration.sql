-- MentoriFY Communication Core -- Meta WhatsApp base (block 32). Additive only: 7 new tables, 7 new enums,
-- zero existing tables/columns touched. Applied directly via psql (same pre-existing migration-tracking drift
-- documented in .claude/skills/mentorify-promoter-portal/references/CURRENT_STATE.md) rather than
-- `prisma migrate dev`. Rollback: drop the 7 tables below (children first) and the 7 enum types.

CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');
CREATE TYPE "WhatsAppPhoneNumberStatus" AS ENUM ('PENDING', 'VERIFIED', 'DISABLED');
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "DataDeletionRequestStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'META',
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "wabaId" TEXT,
    "businessId" TEXT,
    "displayName" TEXT,
    "encryptedAccessToken" TEXT,
    "tokenMetadata" JSONB,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppConnection_tenantId_key" ON "WhatsAppConnection"("tenantId");
CREATE INDEX "WhatsAppConnection_tenantId_status_idx" ON "WhatsAppConnection"("tenantId", "status");
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppPhoneNumber" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "status" "WhatsAppPhoneNumberStatus" NOT NULL DEFAULT 'PENDING',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppPhoneNumber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppPhoneNumber_phoneNumberId_key" ON "WhatsAppPhoneNumber"("phoneNumberId");
CREATE INDEX "WhatsAppPhoneNumber_tenantId_connectionId_idx" ON "WhatsAppPhoneNumber"("tenantId", "connectionId");
ALTER TABLE "WhatsAppPhoneNumber" ADD CONSTRAINT "WhatsAppPhoneNumber_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "whatsappPhoneNumberId" TEXT NOT NULL,
    "customerId" TEXT,
    "externalContactPhone" TEXT NOT NULL,
    "externalContactName" TEXT,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_whatsappPhoneNumberId_extern_key" ON "WhatsAppConversation"("tenantId", "whatsappPhoneNumberId", "externalContactPhone");
CREATE INDEX "WhatsAppConversation_tenantId_status_lastMessageAt_idx" ON "WhatsAppConversation"("tenantId", "status", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_tenantId_customerId_idx" ON "WhatsAppConversation"("tenantId", "customerId");
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_whatsappPhoneNumberId_fkey" FOREIGN KEY ("whatsappPhoneNumberId") REFERENCES "WhatsAppPhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "externalMessageId" TEXT,
    "senderUserId" TEXT,
    "body" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "rawPayload" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppMessage_externalMessageId_key" ON "WhatsAppMessage"("externalMessageId");
CREATE INDEX "WhatsAppMessage_tenantId_conversationId_createdAt_idx" ON "WhatsAppMessage"("tenantId", "conversationId", "createdAt");
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "externalTemplateId" TEXT,
    "bodyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppTemplate_tenantId_connectionId_name_language_key" ON "WhatsAppTemplate"("tenantId", "connectionId", "name", "language");
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MetaDataDeletionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "metaUserId" TEXT,
    "confirmationCode" TEXT NOT NULL,
    "status" "DataDeletionRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "requestPayload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaDataDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaDataDeletionRequest_confirmationCode_key" ON "MetaDataDeletionRequest"("confirmationCode");
CREATE INDEX "MetaDataDeletionRequest_tenantId_status_idx" ON "MetaDataDeletionRequest"("tenantId", "status");
