import { getPrisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/communication-core/security/encryption";
import * as metaClient from "@/lib/communication-core/providers/meta-whatsapp/client";
import { parseWebhookPayload } from "@/lib/communication-core/providers/meta-whatsapp/webhook";
import type { MetaWebhookPayload } from "@/lib/communication-core/providers/meta-whatsapp/types";
import type { CommunicationAdapter } from "@/lib/communication-core/contracts/adapter";
import { resolveTenantFromPhoneNumberId } from "@/lib/communication-core/tenant/resolve";

// This file is the Core's own service layer — it may use Prisma freely for the WhatsApp*/Tenant models (its own
// domain), but never imports Customer or any CRM module. Vertical-specific logic (resolving a Customer, deciding
// what an incoming message means) always goes through the injected CommunicationAdapter.

export async function getConnectionForTenant(tenantId: string) {
  return getPrisma().whatsAppConnection.findUnique({ where: { tenantId }, include: { phoneNumbers: true } });
}

// Embedded Signup completion (section 12): exchanges the short-lived code for a token server-side, fetches real
// WABA/phone details from Graph API, and persists — tenantId/userId always come from the caller's own session,
// never from the request body.
export async function connectWhatsAppForTenant(tenantId: string, userId: string, input: { code: string; wabaId: string; phoneNumberId: string }) {
  const prisma = getPrisma();
  let connection = await prisma.whatsAppConnection.findUnique({ where: { tenantId } });
  try {
    const token = await metaClient.exchangeCodeForToken(input.code);
    const [waba, phone] = await Promise.all([
      metaClient.getWabaInfo(input.wabaId, token.access_token),
      metaClient.getPhoneNumberInfo(input.phoneNumberId, token.access_token),
    ]);
    const encryptedAccessToken = encryptSecret(token.access_token);
    connection = await prisma.whatsAppConnection.upsert({
      where: { tenantId },
      update: { status: "CONNECTED", wabaId: input.wabaId, businessId: waba.id, displayName: waba.name ?? null, encryptedAccessToken, tokenMetadata: { tokenType: token.token_type ?? null, expiresIn: token.expires_in ?? null }, connectedByUserId: userId, connectedAt: new Date(), disconnectedAt: null, lastErrorMessage: null },
      create: { tenantId, wabaId: input.wabaId, businessId: waba.id, displayName: waba.name ?? null, encryptedAccessToken, tokenMetadata: { tokenType: token.token_type ?? null, expiresIn: token.expires_in ?? null }, connectedByUserId: userId, status: "CONNECTED", connectedAt: new Date() },
    });
    await prisma.whatsAppPhoneNumber.upsert({
      where: { phoneNumberId: input.phoneNumberId },
      update: { connectionId: connection.id, tenantId, displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null, status: phone.code_verification_status === "VERIFIED" ? "VERIFIED" : "PENDING" },
      create: { connectionId: connection.id, tenantId, phoneNumberId: input.phoneNumberId, displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null, status: phone.code_verification_status === "VERIFIED" ? "VERIFIED" : "PENDING", isDefault: true },
    });
    return connection;
  } catch (error) {
    const message = error instanceof Response ? await error.text().catch(() => "Error de Meta") : "No fue posible completar la conexión";
    await prisma.whatsAppConnection.upsert({
      where: { tenantId },
      update: { status: "ERROR", lastErrorMessage: message },
      create: { tenantId, status: "ERROR", lastErrorMessage: message },
    });
    throw error;
  }
}

// Deliberately never deletes the connection row or historical messages (section 2/14: "NO borrar conexión ni
// histórico al apagar el módulo") — only marks it disconnected and clears the sensitive token.
export async function disconnectWhatsAppForTenant(tenantId: string) {
  return getPrisma().whatsAppConnection.update({
    where: { tenantId },
    data: { status: "DISCONNECTED", disconnectedAt: new Date(), encryptedAccessToken: null },
  });
}

export async function sendTextMessage(tenantId: string, toPhone: string, body: string, senderUserId: string) {
  const prisma = getPrisma();
  const connection = await prisma.whatsAppConnection.findUnique({ where: { tenantId }, include: { phoneNumbers: { where: { isDefault: true }, take: 1 } } });
  if (!connection || connection.status !== "CONNECTED" || !connection.encryptedAccessToken) throw new Response("WhatsApp no está conectado para esta empresa", { status: 409 });
  const phoneNumber = connection.phoneNumbers[0];
  if (!phoneNumber) throw new Response("No hay un número de WhatsApp configurado", { status: 409 });
  const accessToken = decryptSecret(connection.encryptedAccessToken);
  const result = await metaClient.sendWhatsAppMessage(phoneNumber.phoneNumberId, accessToken, toPhone, body);
  const externalMessageId = result.messages?.[0]?.id ?? null;

  const conversation = await prisma.whatsAppConversation.upsert({
    where: { tenantId_whatsappPhoneNumberId_externalContactPhone: { tenantId, whatsappPhoneNumberId: phoneNumber.id, externalContactPhone: toPhone } },
    update: { lastMessageAt: new Date() },
    create: { tenantId, connectionId: connection.id, whatsappPhoneNumberId: phoneNumber.id, externalContactPhone: toPhone, status: "OPEN", lastMessageAt: new Date() },
  });
  const message = await prisma.whatsAppMessage.create({
    data: { tenantId, conversationId: conversation.id, direction: "OUTBOUND", externalMessageId, senderUserId, body, status: externalMessageId ? "SENT" : "QUEUED", sentAt: new Date() },
  });
  return { conversation, message };
}

export async function createTemplateForTenant(tenantId: string, input: { name: string; language: string; category: string; bodyText: string }) {
  const prisma = getPrisma();
  const connection = await prisma.whatsAppConnection.findUnique({ where: { tenantId } });
  if (!connection?.wabaId || !connection.encryptedAccessToken) throw new Response("WhatsApp no está conectado para esta empresa", { status: 409 });
  const accessToken = decryptSecret(connection.encryptedAccessToken);
  const result = await metaClient.createTemplate(connection.wabaId, accessToken, input);
  return prisma.whatsAppTemplate.upsert({
    where: { tenantId_connectionId_name_language: { tenantId, connectionId: connection.id, name: input.name, language: input.language } },
    update: { externalTemplateId: result.id, category: input.category, bodyText: input.bodyText, status: (["DRAFT", "PENDING", "APPROVED", "REJECTED"].includes(result.status) ? result.status : "PENDING") as never },
    create: { tenantId, connectionId: connection.id, externalTemplateId: result.id, name: input.name, language: input.language, category: input.category, bodyText: input.bodyText, status: (["DRAFT", "PENDING", "APPROVED", "REJECTED"].includes(result.status) ? result.status : "PENDING") as never },
  });
}

export async function listTemplatesForTenant(tenantId: string) {
  const prisma = getPrisma();
  const connection = await prisma.whatsAppConnection.findUnique({ where: { tenantId } });
  if (!connection?.wabaId || !connection.encryptedAccessToken) return [];
  const accessToken = decryptSecret(connection.encryptedAccessToken);
  const result = await metaClient.listTemplates(connection.wabaId, accessToken);
  await Promise.all(result.data.map((t) => prisma.whatsAppTemplate.upsert({
    where: { tenantId_connectionId_name_language: { tenantId, connectionId: connection.id, name: t.name, language: t.language } },
    update: { externalTemplateId: t.id, category: t.category ?? null, status: (["DRAFT", "PENDING", "APPROVED", "REJECTED"].includes(t.status) ? t.status : "PENDING") as never },
    create: { tenantId, connectionId: connection.id, externalTemplateId: t.id, name: t.name, language: t.language, category: t.category ?? null, status: (["DRAFT", "PENDING", "APPROVED", "REJECTED"].includes(t.status) ? t.status : "PENDING") as never },
  })));
  return prisma.whatsAppTemplate.findMany({ where: { tenantId, connectionId: connection.id }, orderBy: { updatedAt: "desc" } });
}

// Webhook ingestion (sections 13/18/28) — idempotent on Meta's own wamid, and the tenant/connection are always
// resolved from phoneNumberId (see tenant/resolve.ts), never trusted from the payload's own metadata beyond that
// lookup. Unrecognized phone_number_id (not connected to any tenant) is silently ignored, not an error — Meta
// may send test/other-app traffic to the same shared webhook URL.
export async function ingestWebhookPayload(payload: MetaWebhookPayload, adapter: CommunicationAdapter) {
  const prisma = getPrisma();
  const { messages, statuses } = parseWebhookPayload(payload);
  let created = 0, duplicates = 0, ignored = 0;

  for (const inbound of messages) {
    const resolved = await resolveTenantFromPhoneNumberId(inbound.phoneNumberId);
    if (!resolved) { ignored++; continue; }
    const existing = await prisma.whatsAppMessage.findUnique({ where: { externalMessageId: inbound.externalMessageId } });
    if (existing) { duplicates++; continue; }

    const conversationKey = { tenantId_whatsappPhoneNumberId_externalContactPhone: { tenantId: resolved.tenantId, whatsappPhoneNumberId: resolved.whatsappPhoneNumberId, externalContactPhone: inbound.externalContactPhone } };
    const existingConversation = await prisma.whatsAppConversation.findUnique({ where: conversationKey });
    const conversation = existingConversation
      ? await prisma.whatsAppConversation.update({ where: conversationKey, data: { lastMessageAt: new Date(), externalContactName: inbound.externalContactName ?? undefined } })
      : await prisma.whatsAppConversation.create({ data: { tenantId: resolved.tenantId, connectionId: resolved.connectionId, whatsappPhoneNumberId: resolved.whatsappPhoneNumberId, externalContactPhone: inbound.externalContactPhone, externalContactName: inbound.externalContactName, status: "OPEN", lastMessageAt: new Date() } });
    if (!existingConversation) await adapter.onConversationCreated(conversation.id, { tenantId: resolved.tenantId, connectionId: resolved.connectionId, whatsappPhoneNumberId: resolved.whatsappPhoneNumberId, externalContactPhone: inbound.externalContactPhone, externalContactName: inbound.externalContactName });

    if (!conversation.customerId) {
      const match = await adapter.resolveCustomer({ tenantId: resolved.tenantId, connectionId: resolved.connectionId, whatsappPhoneNumberId: resolved.whatsappPhoneNumberId, externalContactPhone: inbound.externalContactPhone, externalContactName: inbound.externalContactName });
      if (match) await prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { customerId: match.id } });
    }

    const message = await prisma.whatsAppMessage.create({
      data: { tenantId: resolved.tenantId, conversationId: conversation.id, direction: "INBOUND", externalMessageId: inbound.externalMessageId, body: inbound.body, messageType: inbound.messageType, status: "RECEIVED", rawPayload: inbound as unknown as object },
    });
    await adapter.onMessageReceived(conversation.id, message.id, inbound.body);
    created++;
  }

  for (const status of statuses) {
    await prisma.whatsAppMessage.updateMany({
      where: { externalMessageId: status.externalMessageId },
      data: { status: (["sent", "delivered", "read", "failed"].includes(status.status) ? status.status.toUpperCase() : "SENT") as never, deliveredAt: status.status === "delivered" ? new Date() : undefined, readAt: status.status === "read" ? new Date() : undefined },
    });
  }

  return { created, duplicates, ignored, statusUpdates: statuses.length };
}
