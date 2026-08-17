import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { getSalesMetrics, resolveDateRange } from "@/lib/business-consolidation";

// Self-service only — every field below is scoped to the authenticated user's own agentId/Employee, never another
// promoter's. There is no listing capability here; "Mis ventas"/"Mis clientes" reuse the already-scoped /crm/sales
// and /crm/customers views instead of a parallel implementation.
export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "promoter-space");
  const prisma = getPrisma();
  const todayRange = resolveDateRange(undefined, new Date().toISOString().slice(0, 10))!;
  const monthRange = resolveDateRange(new Date().toISOString().slice(0, 7))!;

  const [today, period, employee] = await Promise.all([
    getSalesMetrics(context.tenantId, todayRange, { agentId: context.userId }),
    getSalesMetrics(context.tenantId, monthRange, { agentId: context.userId }),
    prisma.employee.findFirst({ where: { tenantId: context.tenantId, userId: context.userId }, include: { jobPosition: true, store: true, compensationPlan: { select: { id: true, name: true, mode: true } } } }),
  ]);

  let commissionProjected: number | null = null, commissionConfirmed: number | null = null;
  if (employee) {
    const [projectedEntry, confirmedEntry] = await Promise.all([
      prisma.payrollEntry.findFirst({ where: { tenantId: context.tenantId, employeeId: employee.id, current: true, payrollPeriod: { status: { in: ["OPEN", "REVIEWED"] } } }, orderBy: { calculatedAt: "desc" } }),
      prisma.payrollEntry.findFirst({ where: { tenantId: context.tenantId, employeeId: employee.id, current: true, payrollPeriod: { status: { in: ["CLOSED", "PAID"] } } }, orderBy: { calculatedAt: "desc" } }),
    ]);
    commissionProjected = projectedEntry?.commissionAmount ? Number(projectedEntry.commissionAmount) : null;
    commissionConfirmed = confirmedEntry?.commissionAmount ? Number(confirmedEntry.commissionAmount) : null;
  }

  return Response.json({ employee, today, period, commissions: { projected: commissionProjected, confirmed: commissionConfirmed } });
} catch (error) { return crmError(error); } }
