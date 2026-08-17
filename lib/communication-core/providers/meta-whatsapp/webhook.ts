import { createHmac, timingSafeEqual } from "node:crypto";
import type { MetaWebhookPayload } from "@/lib/communication-core/providers/meta-whatsapp/types";

// GET verification handshake (Meta's "Webhooks setup" — hub.mode/hub.verify_token/hub.challenge).
export function verifySubscriptionChallenge(mode: string | null, token: string | null, challenge: string | null): string | null {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) return null;
  if (mode === "subscribe" && token === verifyToken && challenge) return challenge;
  return null;
}

// X-Hub-Signature-256 verification (HMAC-SHA256 of the raw body, keyed with the App Secret) — the official
// mechanism to confirm a POST really came from Meta before trusting anything in it.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex"), providedBuf = Buffer.from(provided, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export type NormalizedInboundMessage = {
  phoneNumberId: string;
  externalContactPhone: string;
  externalContactName: string | null;
  externalMessageId: string;
  body: string | null;
  messageType: string;
  timestamp: string;
};

export type NormalizedStatusUpdate = { externalMessageId: string; status: string; timestamp: string };

// Flattens Meta's nested entry/changes/value structure into the two things this codebase actually persists —
// keeps every call site ignorant of the raw webhook shape.
export function parseWebhookPayload(payload: MetaWebhookPayload): { messages: NormalizedInboundMessage[]; statuses: NormalizedStatusUpdate[] } {
  const messages: NormalizedInboundMessage[] = [];
  const statuses: NormalizedStatusUpdate[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const nameByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const message of value.messages ?? []) {
        messages.push({
          phoneNumberId,
          externalContactPhone: message.from,
          externalContactName: nameByWaId.get(message.from) ?? null,
          externalMessageId: message.id,
          body: message.text?.body ?? null,
          messageType: message.type,
          timestamp: message.timestamp,
        });
      }
      for (const status of value.statuses ?? []) statuses.push({ externalMessageId: status.id, status: status.status, timestamp: status.timestamp });
    }
  }
  return { messages, statuses };
}
