import { createHmac, timingSafeEqual } from "node:crypto";

// Meta's classic "signed_request" format (used for both deauthorize and data-deletion callbacks):
// base64url(HMAC-SHA256 signature) + "." + base64url(JSON payload), keyed with the App Secret.
export function parseSignedRequest(signedRequest: string): Record<string, unknown> | null {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return null;
  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) return null;
  const expectedSig = createHmac("sha256", appSecret).update(encodedPayload).digest();
  let providedSig: Buffer;
  try { providedSig = Buffer.from(encodedSig, "base64url"); } catch { return null; }
  if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) return null;
  try { return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")); } catch { return null; }
}
