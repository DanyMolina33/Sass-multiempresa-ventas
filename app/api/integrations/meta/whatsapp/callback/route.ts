import { cookies } from "next/headers";
import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";
import { connectWhatsAppForTenant } from "@/lib/communication-core/whatsapp-service";

const STATE_COOKIE = "meta_wa_connect_state";

// Stable route: /api/integrations/meta/whatsapp/callback (section 12/15). This is NOT the OAuth redirect Meta
// itself calls — Embedded Signup runs in a JS SDK popup and delivers code/wabaId/phoneNumberId to our own
// frontend via postMessage, which then POSTs them here. tenantId/userId always come from the session, never
// from the request body — this is what makes cross-tenant hijack impossible even if state were replayed.
export async function POST(request: Request) {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const body = await request.json() as { code?: string; wabaId?: string; phoneNumberId?: string; state?: string };
    if (!body.code || !body.wabaId || !body.phoneNumberId) return Response.json({ message: "code, wabaId y phoneNumberId son obligatorios." }, { status: 400 });

    const store = await cookies();
    const expectedState = store.get(STATE_COOKIE)?.value;
    store.delete(STATE_COOKIE);
    if (!expectedState || body.state !== expectedState) return Response.json({ message: "La sesión de conexión expiró o es inválida. Intenta de nuevo." }, { status: 409 });

    const connection = await connectWhatsAppForTenant(context.tenantId, context.userId, { code: body.code, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId });
    return Response.json({ connection: { status: connection.status, wabaId: connection.wabaId, displayName: connection.displayName, connectedAt: connection.connectedAt } });
  } catch (error) { return whatsAppError(error); }
}
