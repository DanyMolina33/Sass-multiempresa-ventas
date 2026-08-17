import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { getSalesMetrics, resolveDateRange } from "@/lib/business-consolidation";
import { getSubordinates, supervisorsRanking } from "@/lib/supervisor-team";
import { deriveSupervisorAlerts } from "@/lib/supervisor-alerts";
import { ensureCommercialCode } from "@/lib/commercial-code";
import { getCommissionSummary } from "@/lib/payroll-engine";

// Single aggregator for "Mi gestión" (Inicio Supervisor), same one-request-instead-of-many pattern already used by
// the Promoter Portal's /api/crm/promoter-space. "Mi equipo" here always means real subordinates (User.supervisorId
// = this supervisor's id) — the strict definition from section 26 — which is NOT always the same set that
// requireCrmContext's teamUserIds exposes for a store-linked ("Modo Tienda") supervisor, a pre-existing, separate
// scoping concept (see SUPERVISOR_DATA_FLOW.md for the distinction and why the two aren't merged in this block).
export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    await requireCrmFeature(context.tenantId, "promoter-space");
    const prisma = getPrisma();

    const now = new Date();
    const todayRange = resolveDateRange(undefined, now.toISOString().slice(0, 10))!;
    const monthKey = now.toISOString().slice(0, 7);
    const monthRange = resolveDateRange(monthKey)!;
    const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthRange = resolveDateRange(prevMonthDate.toISOString().slice(0, 7))!;

    const [self, employee, team, todayOwn, periodOwn] = await Promise.all([
      prisma.user.findFirst({ where: { id: context.userId }, select: { name: true, email: true, status: true } }),
      prisma.employee.findFirst({ where: { tenantId: context.tenantId, userId: context.userId }, include: { jobPosition: true, store: true } }),
      getSubordinates(context.tenantId, context.userId),
      getSalesMetrics(context.tenantId, todayRange, { agentId: context.userId }),
      getSalesMetrics(context.tenantId, monthRange, { agentId: context.userId }),
    ]);

    const commercialCode = employee ? await ensureCommercialCode(context.tenantId, employee.id, "SUPERVISOR", self?.name ?? "Supervisor") : null;
    const commissions = employee ? await getCommissionSummary(context.tenantId, employee.id) : { currentPeriod: null, lastPaid: null };

    const teamDetail = await Promise.all(team.map(async (member) => {
      const [monthMetrics, prevMonthMetrics] = await Promise.all([
        getSalesMetrics(context.tenantId, monthRange, { agentId: member.id }),
        getSalesMetrics(context.tenantId, prevMonthRange, { agentId: member.id }),
      ]);
      let goal: { target: number; achieved: number; cumplimiento: number } | null = null;
      if (member.employee) {
        const activeGoal = await prisma.commercialGoal.findFirst({ where: { tenantId: context.tenantId, employeeId: member.employee.id, status: "ACTIVE", metric: "ACTIVATED_SALES", periodStart: { lte: now }, periodEnd: { gte: now } } });
        if (activeGoal) {
          const achieved = (await getSalesMetrics(context.tenantId, { gte: activeGoal.periodStart, lt: new Date(activeGoal.periodEnd.getTime() + 1) }, { agentId: member.id })).aprobadas;
          const target = Number(activeGoal.targetValue);
          goal = { target, achieved, cumplimiento: target > 0 ? Math.round((achieved / target) * 1000) / 10 : 0 };
        }
      }
      // "Tendencia" (section 44) = real month-over-month delta, never fabricated.
      const trend: "up" | "down" | "flat" = monthMetrics.aprobadas > prevMonthMetrics.aprobadas ? "up" : monthMetrics.aprobadas < prevMonthMetrics.aprobadas ? "down" : "flat";
      return { id: member.id, name: member.name, jobPosition: member.employee?.jobPosition.name ?? null, store: member.employee?.store?.name ?? null, salesMonth: monthMetrics.aprobadas, salesPrevMonth: prevMonthMetrics.aprobadas, tasaAprobacion: monthMetrics.tasaAprobacion, trend, goal };
    }));

    const [alerts, ranking, teamTodayPerMember] = await Promise.all([
      deriveSupervisorAlerts(context.tenantId, context.userId),
      supervisorsRanking(context.tenantId, context.userId, monthRange),
      Promise.all(team.map((m) => getSalesMetrics(context.tenantId, todayRange, { agentId: m.id }))),
    ]);
    const teamSalesToday = teamTodayPerMember.reduce((sum, m) => sum + m.aprobadas, 0);

    const teamSalesMonth = teamDetail.reduce((sum, m) => sum + m.salesMonth, 0);
    const goalsWithTarget = teamDetail.filter((m) => m.goal);
    const avgCumplimiento = goalsWithTarget.length ? Math.round((goalsWithTarget.reduce((sum, m) => sum + (m.goal?.cumplimiento ?? 0), 0) / goalsWithTarget.length) * 10) / 10 : null;

    return Response.json({
      user: self,
      employee: employee ? { id: employee.id, jobPosition: employee.jobPosition.name, store: employee.store?.name ?? null, commercialCode } : null,
      today: todayOwn,
      period: periodOwn,
      commissions,
      team: teamDetail,
      teamSummary: { activePromoters: team.length, teamSalesToday, teamSalesMonth, avgCumplimiento },
      supervisorRanking: ranking,
      alerts,
    });
  } catch (error) { return crmError(error); }
}
