import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { getSalesMetrics, resolveDateRange } from "@/lib/business-consolidation";
import { teamRanking } from "@/lib/promoter-ranking";

// Self-service only — every field below is scoped to the authenticated user's own agentId/Employee, never another
// promoter's. There is no listing capability here; "Mis ventas"/"Mis clientes" reuse the already-scoped /crm/sales
// and /crm/customers views instead of a parallel implementation.
//
// Single aggregator for the whole "Mi día" screen (goal + ranking + today's clients/follow-ups + recent sales +
// commissions) on purpose — one request instead of six, per the performance guidance for this portal.
export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "promoter-space");
  const prisma = getPrisma();
  const todayRange = resolveDateRange(undefined, new Date().toISOString().slice(0, 10))!;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthRange = resolveDateRange(monthKey)!;

  const [today, period, employee, self] = await Promise.all([
    getSalesMetrics(context.tenantId, todayRange, { agentId: context.userId }),
    getSalesMetrics(context.tenantId, monthRange, { agentId: context.userId }),
    prisma.employee.findFirst({ where: { tenantId: context.tenantId, userId: context.userId }, include: { jobPosition: true, store: true, compensationPlan: { select: { id: true, name: true, mode: true } } } }),
    prisma.user.findFirst({ where: { id: context.userId }, select: { name: true, email: true, status: true, supervisor: { select: { name: true } } } }),
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

  // Real goal engine (CommercialGoal) — only ever shows a target that actually exists for this employee's current
  // period; "achieved" reuses the same aprobadas/activadas count already trusted everywhere else in the app
  // (getSalesMetrics), never a separately invented calculation.
  let goal: { targetValue: number; periodStart: string; periodEnd: string; achieved: number; daysRemaining: number } | null = null;
  if (employee) {
    const now = new Date();
    const activeGoal = await prisma.commercialGoal.findFirst({ where: { tenantId: context.tenantId, employeeId: employee.id, status: "ACTIVE", metric: "ACTIVATED_SALES", periodStart: { lte: now }, periodEnd: { gte: now } }, orderBy: { createdAt: "desc" } });
    if (activeGoal) {
      const achievedMetrics = await getSalesMetrics(context.tenantId, { gte: activeGoal.periodStart, lt: new Date(activeGoal.periodEnd.getTime() + 1) }, { agentId: context.userId });
      goal = { targetValue: Number(activeGoal.targetValue), periodStart: activeGoal.periodStart.toISOString(), periodEnd: activeGoal.periodEnd.toISOString(), achieved: achievedMetrics.aprobadas, daysRemaining: Math.max(0, Math.ceil((activeGoal.periodEnd.getTime() - now.getTime()) / 86400000)) };
    }
  }

  const ranking = await teamRanking(context.tenantId, context.userId, monthRange);

  const followUpsToday = await prisma.followUp.findMany({
    where: { tenantId: context.tenantId, assignedUserId: context.userId, scheduledAt: todayRange, status: "PENDING" },
    include: { customer: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 8,
  });

  const recentSales = await prisma.sale.findMany({
    where: { tenantId: context.tenantId, agentId: context.userId },
    select: { id: true, customerNameSnapshot: true, productNameSnapshot: true, saleAmount: true, saleDate: true, status: true },
    orderBy: { saleDate: "desc" },
    take: 5,
  });

  return Response.json({
    user: self ? { name: self.name, email: self.email, status: self.status } : null,
    employee, supervisorName: self?.supervisor?.name ?? null,
    today, period,
    commissions: { projected: commissionProjected, confirmed: commissionConfirmed },
    goal,
    ranking: { position: ranking.position, total: ranking.total, entries: ranking.entries.slice(0, 5) },
    followUpsToday: followUpsToday.map((item) => ({ id: item.id, scheduledAt: item.scheduledAt, type: item.type, notes: item.notes, customer: item.customer })),
    recentSales: recentSales.map((sale) => ({ id: sale.id, customerName: sale.customerNameSnapshot, productName: sale.productNameSnapshot, amount: sale.saleAmount ? Number(sale.saleAmount) : null, saleDate: sale.saleDate, status: sale.status })),
  });
} catch (error) { return crmError(error); } }
