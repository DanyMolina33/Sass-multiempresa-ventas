import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";
import { sendTextMessage } from "@/lib/communication-core/whatsapp-service";

// Section 20 — controlled ADMIN-only test send, for App Review evidence later. Never triggered automatically;
// requires an explicit recipient phone number in the request body every time.
export async function POST(request: Request) {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const body = await request.json() as { toPhone?: string; body?: string };
    if (!body.toPhone?.trim() || !body.body?.trim()) return Response.json({ message: "Número destino y mensaje son obligatorios." }, { status: 400 });
    const result = await sendTextMessage(context.tenantId, body.toPhone.trim(), body.body.trim(), context.userId);
    return Response.json({ message: result.message });
  } catch (error) { return whatsAppError(error); }
}
