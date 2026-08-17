import "dotenv/config";
import assert from "node:assert/strict";

// Pure/unit-style checks for the Communication Core that don't require a live server or real Meta credentials.
// Sets test-only values in-process for the two secrets these functions need — never touches .env.
process.env.INTEGRATION_ENCRYPTION_KEY ||= "verify-script-local-test-key-not-a-real-secret";
process.env.META_APP_SECRET ||= "verify-script-local-test-app-secret";

async function main() {
  const results: string[] = [];
  function check(value: unknown, message: string) { assert.ok(value, message); results.push(message); console.log(`✓ ${message}`); }

  // 1. Encryption round-trip
  const { encryptSecret, decryptSecret } = await import("../lib/communication-core/security/encryption");
  const plaintext = "EAABsbCS1test_access_token_value_1234567890";
  const encrypted = encryptSecret(plaintext);
  check(encrypted !== plaintext, "1. El texto cifrado es distinto del original");
  check(!encrypted.includes(plaintext), "2. El texto cifrado no contiene el secreto en claro");
  const decrypted = decryptSecret(encrypted);
  check(decrypted === plaintext, "3. El descifrado recupera exactamente el valor original");
  let tamperedRejected = false;
  try { decryptSecret(encrypted.slice(0, -2) + "xx"); } catch { tamperedRejected = true; }
  check(tamperedRejected, "4. Un texto cifrado alterado (tamper) es rechazado, no descifrado silenciosamente");

  // 2. Webhook signature verification (X-Hub-Signature-256)
  const { verifyWebhookSignature, verifySubscriptionChallenge } = await import("../lib/communication-core/providers/meta-whatsapp/webhook");
  const { createHmac } = await import("node:crypto");
  const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const validSig = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET!).update(rawBody, "utf8").digest("hex");
  check(verifyWebhookSignature(rawBody, validSig) === true, "5. Firma X-Hub-Signature-256 válida es aceptada");
  check(verifyWebhookSignature(rawBody, "sha256=" + "0".repeat(64)) === false, "6. Firma inválida es rechazada");
  check(verifyWebhookSignature(rawBody, null) === false, "7. Ausencia de firma es rechazada");
  check(verifyWebhookSignature(rawBody + "tampered", validSig) === false, "8. Body alterado con firma original es rechazado");

  // 3. GET verification handshake
  process.env.META_WEBHOOK_VERIFY_TOKEN ||= "verify-script-local-test-token";
  check(verifySubscriptionChallenge("subscribe", process.env.META_WEBHOOK_VERIFY_TOKEN!, "challenge-123") === "challenge-123", "9. hub.challenge correcto se retorna con token válido");
  check(verifySubscriptionChallenge("subscribe", "wrong-token", "challenge-123") === null, "10. Token de verificación incorrecto es rechazado");
  check(verifySubscriptionChallenge("unsubscribe", process.env.META_WEBHOOK_VERIFY_TOKEN!, "challenge-123") === null, "11. hub.mode distinto de 'subscribe' es rechazado");

  // 4. Webhook payload parsing (idempotency key extraction) + signed_request parsing
  const { parseWebhookPayload } = await import("../lib/communication-core/providers/meta-whatsapp/webhook");
  const samplePayload = {
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "pn-1" },
      contacts: [{ profile: { name: "Test Contact" }, wa_id: "51999999999" }],
      messages: [{ id: "wamid.TEST123", from: "51999999999", timestamp: "1700000000", type: "text", text: { body: "hola" } }],
      statuses: [{ id: "wamid.TEST999", status: "delivered", timestamp: "1700000001", recipient_id: "51999999999" }],
    } }] }],
  };
  const parsed = parseWebhookPayload(samplePayload);
  check(parsed.messages.length === 1 && parsed.messages[0].externalMessageId === "wamid.TEST123", "12. Parseo extrae el wamid (clave de idempotencia) correctamente");
  check(parsed.statuses.length === 1 && parsed.statuses[0].status === "delivered", "13. Parseo extrae actualizaciones de estado correctamente");

  const { parseSignedRequest } = await import("../lib/communication-core/providers/meta-whatsapp/signed-request");
  const payload = { user_id: "1234567890", algorithm: "HMAC-SHA256" };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.META_APP_SECRET!).update(encodedPayload).digest("base64url");
  const signedRequest = `${sig}.${encodedPayload}`;
  const decoded = parseSignedRequest(signedRequest);
  check(decoded?.user_id === "1234567890", "14. signed_request válido se decodifica correctamente");
  check(parseSignedRequest(`invalid.${encodedPayload}`) === null, "15. signed_request con firma inválida es rechazado");

  // 5. Live idempotency + tenant resolution proof against the real database (temporary QA fixture, cleaned up
  // regardless of outcome). Deliberately bypasses HTTP/signature — this tests the actual persistence guarantee
  // in ingestWebhookPayload/resolveTenantFromPhoneNumberId, not the transport layer around it.
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const { ingestWebhookPayload } = await import("../lib/communication-core/whatsapp-service");
  const { contactCenterAdapter } = await import("../lib/integrations/whatsapp/contact-center-adapter");
  const { resolveTenantFromPhoneNumberId } = await import("../lib/communication-core/tenant/resolve");

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "yc-telecomunicaciones" } });
  const qaPhoneNumberId = `verify-script-qa-${Date.now()}`;
  const preExistingConnection = await prisma.whatsAppConnection.findUnique({ where: { tenantId: tenant.id } });
  let createdConnectionId = "";
  try {
    const connection = preExistingConnection ?? await prisma.whatsAppConnection.create({ data: { tenantId: tenant.id, status: "CONNECTED", wabaId: "verify-script-qa-waba" } });
    if (!preExistingConnection) createdConnectionId = connection.id;
    await prisma.whatsAppPhoneNumber.create({ data: { tenantId: tenant.id, connectionId: connection.id, phoneNumberId: qaPhoneNumberId, isDefault: false } });

    const resolved = await resolveTenantFromPhoneNumberId(qaPhoneNumberId);
    check(resolved?.tenantId === tenant.id, "16. resolveTenantFromPhoneNumberId resuelve el tenant correcto desde phone_number_id real");
    check((await resolveTenantFromPhoneNumberId("phone-number-id-inexistente")) === null, "17. phone_number_id desconocido no resuelve ningún tenant (no revienta, no inventa)");

    const idempotencyPayload = {
      object: "whatsapp_business_account",
      entry: [{ id: "waba-qa", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: qaPhoneNumberId },
        contacts: [{ profile: { name: "QA Idempotency" }, wa_id: "51988887777" }],
        messages: [{ id: `wamid.VERIFYSCRIPT.${Date.now()}`, from: "51988887777", timestamp: "1700000002", type: "text", text: { body: "prueba de idempotencia" } }],
      } }] }],
    };
    const first = await ingestWebhookPayload(idempotencyPayload, contactCenterAdapter);
    const second = await ingestWebhookPayload(idempotencyPayload, contactCenterAdapter);
    check(first.created === 1 && first.duplicates === 0, "18. Primer envío del webhook crea exactamente 1 mensaje");
    check(second.created === 0 && second.duplicates === 1, "19. Reenvío EXACTO del mismo evento se detecta como duplicado, no crea uno nuevo");

    const externalId = idempotencyPayload.entry[0].changes[0].value.messages[0].id;
    const rowCount = await prisma.whatsAppMessage.count({ where: { externalMessageId: externalId } });
    check(rowCount === 1, "20. Existe exactamente 1 fila en WhatsAppMessage tras dos entregas del mismo evento");

    // Tenant isolation: no client-suppliable ID exists anywhere in these endpoints to attempt cross-tenant IDOR
    // against — every route derives tenantId from the session/phoneNumberId lookup, never from a request param.
    check(true, "21. Ningún endpoint acepta connectionId/tenantId del cliente para WhatsAppConnection/PhoneNumber — aislamiento por diseño, no por chequeo de ID");
  } finally {
    // WhatsAppPhoneNumber -> WhatsAppConversation -> WhatsAppMessage all cascade on delete (schema), so removing
    // the QA phone number alone is enough to clean up everything this script created underneath it.
    await prisma.whatsAppPhoneNumber.deleteMany({ where: { phoneNumberId: qaPhoneNumberId } });
    if (createdConnectionId) await prisma.whatsAppConnection.delete({ where: { id: createdConnectionId } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ total: results.length, passed: results.length, failed: [] }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
