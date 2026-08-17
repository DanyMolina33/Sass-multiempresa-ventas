import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getSubordinates } from "@/lib/supervisor-team";

// Section 46 — reuses the real, pre-existing ActionPlan table (0 rows before this block; see CURRENT_STATE.md).
// Fields mapped to what actually exists in the schema: no separate "avance %" or comment thread column exists, so
// progress is tracked via `status` only and there is no comment thread in this V1 (documented as a real pendiente).
export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const team = await getSubordinates(context.tenantId, context.userId);
    const teamIds = team.map((m) => m.id);
    const plans = teamIds.length ? await getPrisma().actionPlan.findMany({ where: { tenantId: context.tenantId, assignedUserId: { in: teamIds } }, orderBy: { createdAt: "desc" } }) : [];
    const nameById = new Map(team.map((m) => [m.id, m.name]));
    return Response.json({ plans: plans.map((p) => ({ ...p, assignedUserName: p.assignedUserId ? nameById.get(p.assignedUserId) ?? "—" : "—" })), team: team.map((m) => ({ id: m.id, name: m.name })) });
  } catch (error) { return crmError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const body = await request.json() as { assignedUserId?: string; title?: string; problemDescription?: string; actionDescription?: string; priority?: string; sourcePeriodStart?: string; dueAt?: string };
    if (!body.assignedUserId || !body.title?.trim() || !body.problemDescription?.trim() || !body.actionDescription?.trim()) return Response.json({ message: "Responsable, título, problema y acciones son obligatorios." }, { status: 400 });
    const team = await getSubordinates(context.tenantId, context.userId);
    if (!team.some((m) => m.id === body.assignedUserId)) throw new Response("Promotor fuera de tu equipo", { status: 403 });
    const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.priority ?? "") ? body.priority! : "MEDIUM";
    const employee = team.find((m) => m.id === body.assignedUserId)?.employee ?? null;
    const code = `AP-${body.assignedUserId}-${Date.now()}`;
    const plan = await getPrisma().actionPlan.create({
      data: {
        tenantId: context.tenantId, code, title: body.title.trim(), problemDescription: body.problemDescription.trim(), actionDescription: body.actionDescription.trim(),
        origin: "MANUAL", priority: priority as never, status: "OPEN", scopeType: "EMPLOYEE",
        employeeId: employee?.id ?? null, assignedUserId: body.assignedUserId, createdByUserId: context.userId,
        sourcePeriodStart: body.sourcePeriodStart ? new Date(body.sourcePeriodStart) : null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    return Response.json({ plan }, { status: 201 });
  } catch (error) { return crmError(error); }
}
