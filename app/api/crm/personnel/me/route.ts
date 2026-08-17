import { requireSession } from "@/lib/auth";
import { crmError } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";

// Deliberately NOT gated by requirePersonnelRead — any authenticated tenant user (including AGENT) may see their
// own linked employee summary, but only their own; there is no listing/other-employee access through this route.
export async function GET() { try {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  if (!tenantId) throw new Response("Usuario sin tenant", { status: 403 });
  const employee = await getPrisma().employee.findFirst({
    where: { tenantId, userId: session.user.id },
    include: { jobPosition: true, compensationPlan: { select: { id: true, name: true, mode: true } } },
  });
  if (!employee) return Response.json({ employee: null, latestEntry: null });
  const latestEntry = await getPrisma().payrollEntry.findFirst({ where: { tenantId, employeeId: employee.id, current: true }, orderBy: { calculatedAt: "desc" }, include: { payrollPeriod: { select: { id: true, code: true, status: true } } } });
  return Response.json({ employee, latestEntry });
} catch (error) { return crmError(error); } }
