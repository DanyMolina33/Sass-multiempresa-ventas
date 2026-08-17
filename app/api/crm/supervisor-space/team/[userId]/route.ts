import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getSalesMetrics, resolveDateRange } from "@/lib/business-consolidation";

// Ficha del Promotor (section 27) — never exposes password/link/reset/role/módulos, that belongs to the Gerente's
// Usuarios screen only. Only reachable for a real direct subordinate (User.supervisorId === this supervisor).
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const { userId } = await params;
    const prisma = getPrisma();
    const member = await prisma.user.findFirst({ where: { id: userId, tenantId: context.tenantId, supervisorId: context.userId }, select: { id: true, name: true, email: true, status: true, employee: { select: { id: true, jobPosition: { select: { name: true } }, store: { select: { name: true } }, commercialCode: true } } } });
    if (!member) throw new Response("Promotor fuera de tu equipo", { status: 403 });

    const monthKey = new Date().toISOString().slice(0, 7);
    const monthRange = resolveDateRange(monthKey)!;
    const now = new Date();

    const [period, recentSales, customers, followUps, goal, actionPlans] = await Promise.all([
      getSalesMetrics(context.tenantId, monthRange, { agentId: member.id }),
      prisma.sale.findMany({ where: { tenantId: context.tenantId, agentId: member.id }, select: { id: true, customerNameSnapshot: true, productNameSnapshot: true, saleAmount: true, saleDate: true, status: true }, orderBy: { saleDate: "desc" }, take: 10 }),
      prisma.customer.count({ where: { tenantId: context.tenantId, ownerUserId: member.id } }),
      prisma.followUp.findMany({ where: { tenantId: context.tenantId, assignedUserId: member.id, status: "PENDING" }, select: { id: true, scheduledAt: true, type: true, customer: { select: { name: true } } }, orderBy: { scheduledAt: "asc" }, take: 10 }),
      member.employee ? prisma.commercialGoal.findFirst({ where: { tenantId: context.tenantId, employeeId: member.employee.id, status: "ACTIVE", metric: "ACTIVATED_SALES", periodStart: { lte: now }, periodEnd: { gte: now } } }) : null,
      prisma.actionPlan.findMany({ where: { tenantId: context.tenantId, assignedUserId: member.id }, select: { id: true, title: true, status: true, priority: true, dueAt: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);

    let goalDetail = null;
    if (goal) {
      const achieved = (await getSalesMetrics(context.tenantId, { gte: goal.periodStart, lt: new Date(goal.periodEnd.getTime() + 1) }, { agentId: member.id })).aprobadas;
      goalDetail = { target: Number(goal.targetValue), achieved, periodStart: goal.periodStart, periodEnd: goal.periodEnd };
    }

    return Response.json({
      user: { id: member.id, name: member.name, email: member.email, status: member.status },
      employee: member.employee,
      period,
      recentSales: recentSales.map((sale) => ({ ...sale, saleAmount: sale.saleAmount ? Number(sale.saleAmount) : null })),
      customersCount: customers, followUps, goal: goalDetail, actionPlans,
    });
  } catch (error) { return crmError(error); }
}
