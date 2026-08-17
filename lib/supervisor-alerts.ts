import { getSalesMetrics } from "@/lib/business-consolidation";
import { getPrisma } from "@/lib/prisma";
import { getSubordinates } from "@/lib/supervisor-team";

export type SupervisorAlert = { key: string; severity: "info" | "warning" | "critical"; message: string; userId?: string; userName?: string };

// Alerts are always DERIVED live from real data (FollowUp, CommercialGoal, Sale) — nothing is stored or mocked
// (section 45: "No mocks"). Recomputed on every request; cheap enough at this team size.
export async function deriveSupervisorAlerts(tenantId: string, supervisorId: string): Promise<SupervisorAlert[]> {
  const prisma = getPrisma();
  const team = await getSubordinates(tenantId, supervisorId);
  const alerts: SupervisorAlert[] = [];
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  for (const member of team) {
    const overdue = await prisma.followUp.count({ where: { tenantId, assignedUserId: member.id, status: "PENDING", scheduledAt: { lt: now } } });
    if (overdue > 0) alerts.push({ key: `overdue-${member.id}`, severity: "warning", message: `${member.name} tiene ${overdue} seguimiento${overdue === 1 ? "" : "s"} vencido${overdue === 1 ? "" : "s"}.`, userId: member.id, userName: member.name });

    const monthMetrics = await getSalesMetrics(tenantId, { gte: monthStart, lt: nextMonth }, { agentId: member.id });
    if (monthMetrics.total === 0) alerts.push({ key: `no-activity-${member.id}`, severity: "warning", message: `${member.name} no tiene ventas registradas este mes.`, userId: member.id, userName: member.name });

    if (member.employee) {
      const goal = await prisma.commercialGoal.findFirst({ where: { tenantId, employeeId: member.employee.id, status: "ACTIVE", metric: "ACTIVATED_SALES", periodStart: { lte: now }, periodEnd: { gte: now } } });
      if (goal) {
        const daysRemaining = Math.ceil((goal.periodEnd.getTime() - now.getTime()) / 86400000);
        const achieved = (await getSalesMetrics(tenantId, { gte: goal.periodStart, lt: new Date(goal.periodEnd.getTime() + 1) }, { agentId: member.id })).aprobadas;
        const target = Number(goal.targetValue);
        if (daysRemaining <= 3 && daysRemaining >= 0 && achieved < target) alerts.push({ key: `goal-ending-${member.id}`, severity: "critical", message: `La meta de ${member.name} vence en ${daysRemaining} día${daysRemaining === 1 ? "" : "s"} y va en ${achieved} de ${target}.`, userId: member.id, userName: member.name });
      }
    }
  }
  return alerts;
}
