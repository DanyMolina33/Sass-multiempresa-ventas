import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";
import { getConnectionForTenant } from "@/lib/communication-core/whatsapp-service";

// Full WABA/phone details are COMPANY_ADMIN-only (section 10/21) — never exposes the encrypted token itself,
// this endpoint doesn't even select that column.
export async function GET() {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const connection = await getConnectionForTenant(context.tenantId);
    if (!connection) return Response.json({ connection: null });
    return Response.json({
      connection: {
        status: connection.status,
        wabaId: connection.wabaId,
        businessId: connection.businessId,
        displayName: connection.displayName,
        connectedAt: connection.connectedAt,
        disconnectedAt: connection.disconnectedAt,
        lastErrorMessage: connection.lastErrorMessage,
        phoneNumbers: connection.phoneNumbers.map((p) => ({ id: p.id, phoneNumberId: p.phoneNumberId, displayPhoneNumber: p.displayPhoneNumber, verifiedName: p.verifiedName, status: p.status, isDefault: p.isDefault })),
      },
    });
  } catch (error) { return whatsAppError(error); }
}
