import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { parseSignedRequest } from "@/lib/communication-core/providers/meta-whatsapp/signed-request";

// Stable route: /api/integrations/meta/data-deletion (section 14/15). Public — Meta calls this directly with a
// form-encoded `signed_request`. This registers the request and returns Meta's required {url, confirmation_code}
// shape; it never deletes anything by itself (section 14: "NO borrar datos comerciales arbitrariamente" — WhatsApp
// connection data and business/commercial data have different retention bases and are never conflated here).
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ message: "signed_request es obligatorio." }, { status: 400 });

  const payload = parseSignedRequest(signedRequest);
  if (!payload) return Response.json({ message: "Firma inválida." }, { status: 401 });

  const metaUserId = typeof payload.user_id === "string" ? payload.user_id : null;
  const confirmationCode = randomBytes(12).toString("hex");
  await getPrisma().metaDataDeletionRequest.create({
    data: { metaUserId, confirmationCode, status: "RECEIVED", requestPayload: payload as object },
  });

  const origin = new URL(request.url).origin;
  return Response.json({
    url: `${origin}/api/integrations/meta/data-deletion/status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
