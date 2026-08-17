import { getPrisma } from "@/lib/prisma";

// Minimal "identidad comercial propia" (section 14) — generated once, never hardcoded, unique per tenant.
// Pattern: <ROLE_PREFIX>-<3-letter initials>-<2-digit sequence>, e.g. SUP-MAR-01. Collision-safe via retry.
function slugInitials(name: string) {
  const letters = name.trim().toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ ]/g, "").split(/\s+/).map((part) => part[0]).join("");
  return (letters || "USR").slice(0, 3).padEnd(3, "X");
}

function rolePrefix(roleCode: string) {
  if (roleCode === "SUPERVISOR") return "SUP";
  if (roleCode === "AGENT") return "PRM";
  return "USR";
}

export async function ensureCommercialCode(tenantId: string, employeeId: string, roleCode: string, name: string): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.employee.findUnique({ where: { id: employeeId }, select: { commercialCode: true } });
  if (existing?.commercialCode) return existing.commercialCode;
  const base = `${rolePrefix(roleCode)}-${slugInitials(name)}`;
  for (let seq = 1; seq <= 99; seq++) {
    const candidate = `${base}-${String(seq).padStart(2, "0")}`;
    const taken = await prisma.employee.findFirst({ where: { tenantId, commercialCode: candidate }, select: { id: true } });
    if (!taken) {
      await prisma.employee.update({ where: { id: employeeId }, data: { commercialCode: candidate } });
      return candidate;
    }
  }
  throw new Error("No fue posible generar un código comercial único");
}
