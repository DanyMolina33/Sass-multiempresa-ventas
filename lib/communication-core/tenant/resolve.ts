import { getPrisma } from "@/lib/prisma";

// The ONLY safe way to know which tenant a WhatsApp webhook event belongs to: walk from Meta's own
// phone_number_id (which we stored at connect time) back through WhatsAppPhoneNumber -> WhatsAppConnection ->
// Tenant. Never trust a tenantId sent in a payload, header, or query string (section 13: "Nunca confiar en
// tenantId recibido desde payload/frontend").
export async function resolveTenantFromPhoneNumberId(phoneNumberId: string) {
  const prisma = getPrisma();
  const phone = await prisma.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId },
    select: { id: true, tenantId: true, connectionId: true },
  });
  if (!phone) return null;
  return { tenantId: phone.tenantId, connectionId: phone.connectionId, whatsappPhoneNumberId: phone.id };
}
