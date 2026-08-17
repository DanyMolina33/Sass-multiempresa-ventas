import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM authenticated encryption for anything sensitive the Communication Core stores server-side (Meta
// access tokens, App Secret-derived material) — never plaintext in the database, never sent to the browser.
// Key comes from INTEGRATION_ENCRYPTION_KEY (env only, never committed) via scrypt so any passphrase length works.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret) throw new Error("INTEGRATION_ENCRYPTION_KEY no está configurada");
  return scryptSync(secret, "mentorify-communication-core", 32);
}

// Format: <iv>:<authTag>:<ciphertext>, all base64url — a single opaque string safe to store in one TEXT column.
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Formato de secreto cifrado inválido");
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}
