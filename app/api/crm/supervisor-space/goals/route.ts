import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getSalesMetrics } from "@/lib/business-consolidation";
import { getSubordinates } from "@/lib/supervisor-team";

// Section 28/30/31: Supervisor may assign goals only to their own subordinates, metric is fixed to the only one the
// real engine currently supports (ACTIVATED_SALES, section 29). Reuses the exact same CommercialGoal entity the
// Promoter Portal already reads from — a Promotor sees the goal automatically, no copy/duplication.
export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const prisma = getPrisma();
    const team = await getSubordinates(context.tenantId, context.userId);
    const employeeIds = team.map((m) => m.employee?.id).filter((id): id is string => Boolean(id));
    const now = new Date();
    const goals = employeeIds.length ? await prisma.commercialGoal.findMany({ where: { tenantId: context.tenantId, employeeId: { in: employeeIds } }, orderBy: { createdAt: "desc" } }) : [];
    const byEmployeeId = new Map(team.filter((m) => m.employee).map((m) => [m.employee!.id, m]));
    const detailed = await Promise.all(goals.map(async (goal) => {
      const isCurrent = goal.status === "ACTIVE" && goal.periodStart <= now && goal.periodEnd >= now;
      const member = byEmployeeId.get(goal.employeeId ?? "");
      const achieved = isCurrent && member ? (await getSalesMetrics(context.tenantId, { gte: goal.periodStart, lt: new Date(goal.periodEnd.getTime() + 1) }, { agentId: member.id })).aprobadas : null;
      return { id: goal.id, name: goal.name, targetValue: Number(goal.targetValue), periodStart: goal.periodStart, periodEnd: goal.periodEnd, status: goal.status, promoterId: member?.id ?? null, promoterName: member?.name ?? "—", achieved };
    }));
    return Response.json({ goals: detailed, team: team.map((m) => ({ id: m.id, name: m.name, hasEmployee: Boolean(m.employee) })) });
  } catch (error) { return crmError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const body = await request.json() as { promoterId?: string; name?: string; targetValue?: number; periodStart?: string; periodEnd?: string };
    if (!body.promoterId || !body.name?.trim() || !body.targetValue || !body.periodStart || !body.periodEnd) return Response.json({ message: "Promotor, nombre, valor objetivo y período son obligatorios." }, { status: 400 });
    if (body.targetValue <= 0) return Response.json({ message: "El valor objetivo debe ser mayor a cero." }, { status: 400 });
    const prisma = getPrisma();
    // Never a promoter from another supervisor (section 28: "Nunca a Promotores de otro Supervisor").
    const promoter = await prisma.user.findFirst({ where: { id: body.promoterId, tenantId: context.tenantId, supervisorId: context.userId, status: "ACTIVE" }, include: { employee: true } });
    if (!promoter) throw new Response("Promotor fuera de tu equipo", { status: 403 });
    if (!promoter.employee) return Response.json({ message: "Este promotor no tiene un registro de Empleado vinculado; no se le puede asignar una meta." }, { status: 400 });
    const periodStart = new Date(body.periodStart), periodEnd = new Date(body.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) return Response.json({ message: "Período inválido." }, { status: 400 });
    const code = `GOAL-${promoter.employee.id}-${Date.now()}`;
    const goal = await prisma.commercialGoal.create({ data: { tenantId: context.tenantId, code, name: body.name.trim(), metric: "ACTIVATED_SALES", scopeType: "EMPLOYEE", targetValue: body.targetValue, periodStart, periodEnd, status: "ACTIVE", employeeId: promoter.employee.id, createdByUserId: context.userId } });
    return Response.json({ goal }, { status: 201 });
  } catch (error) { return crmError(error); }
}
