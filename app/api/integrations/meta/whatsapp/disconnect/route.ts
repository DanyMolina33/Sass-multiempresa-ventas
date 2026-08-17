import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";
import { disconnectWhatsAppForTenant } from "@/lib/communication-core/whatsapp-service";

export async function POST() {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const connection = await disconnectWhatsAppForTenant(context.tenantId);
    return Response.json({ connection: { status: connection.status, disconnectedAt: connection.disconnectedAt } });
  } catch (error) { return whatsAppError(error); }
}
