import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

// Base58 (no 0/O/I/l) keeps the short link unambiguous to read aloud or retype. 9 chars ~ 52 bits of entropy —
// enough that enumeration isn't practical, while staying short enough to hand out as a real "link".
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CODE_LENGTH = 9;

function randomCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

// The code carries no meaning (no email, no tenant, no password) — it's purely a lookup key, so a collision
// retry loop is the only correctness requirement, not a specific format.
export async function generateUniqueAccessCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const existing = await getPrisma().user.findUnique({ where: { accessCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("No se pudo generar un enlace corto único, intenta de nuevo.");
}
