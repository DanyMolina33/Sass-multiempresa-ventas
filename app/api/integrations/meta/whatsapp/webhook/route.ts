import { verifySubscriptionChallenge, verifyWebhookSignature } from "@/lib/communication-core/providers/meta-whatsapp/webhook";
import { ingestWebhookPayload } from "@/lib/communication-core/whatsapp-service";
import { contactCenterAdapter } from "@/lib/integrations/whatsapp/contact-center-adapter";
import type { MetaWebhookPayload } from "@/lib/communication-core/providers/meta-whatsapp/types";

// Stable route: /api/integrations/meta/whatsapp/webhook (section 13/15). Public by necessity — Meta calls this
// directly, there is no user session. Authenticity comes from the verify_token handshake (GET) and the
// X-Hub-Signature-256 HMAC (POST), never from anything client-supplied.
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const challenge = verifySubscriptionChallenge(search.get("hub.mode"), search.get("hub.verify_token"), search.get("hub.challenge"));
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });

  let payload: MetaWebhookPayload;
  try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (payload.object !== "whatsapp_business_account") return new Response("OK", { status: 200 });

  try {
    await ingestWebhookPayload(payload, contactCenterAdapter);
  } catch (error) {
    // Meta retries on non-2xx, which would compound with a real error into duplicate retries — the ingestion
    // path is already idempotent on externalMessageId, so log and still return 200 rather than trigger a retry
    // storm for a transient issue.
    console.error("WhatsApp webhook ingestion failed", error);
  }
  return new Response("OK", { status: 200 });
}
