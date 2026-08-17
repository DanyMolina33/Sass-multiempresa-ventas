import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";

const STATE_COOKIE = "meta_wa_connect_state";

// Issues a short-lived, single-use nonce before the frontend opens the Embedded Signup popup (section 12: "state/
// nonce... contra mezcla de sesiones"). The callback must echo it back exactly, and it's cleared either way —
// this is defense in depth on top of the primary guarantee, which is that tenantId always comes from the
// server-side session, never from the browser.
export async function POST() {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const state = randomBytes(24).toString("base64url");
    const store = await cookies();
    store.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return Response.json({ state });
  } catch (error) { return whatsAppError(error); }
}
