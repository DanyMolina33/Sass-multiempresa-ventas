import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";

const STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

// Shared by both sides: the Supervisor who created it can edit anything, the assigned Promotor may only move the
// status forward (section 47: "No puede alterar objetivo principal sin permiso" — title/problem/action stay locked).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireCrmContext();
    const { id } = await params;
    const plan = await getPrisma().actionPlan.findFirst({ where: { id, tenantId: context.tenantId } });
    if (!plan) throw new Response("Plan de acción no encontrado", { status: 404 });
    const isOwner = context.role === "SUPERVISOR" && plan.createdByUserId === context.userId;
    const isAssignee = plan.assignedUserId === context.userId;
    if (!isOwner && !isAssignee) throw new Response("Plan de acción fuera de tu alcance", { status: 403 });

    const body = await request.json() as { status?: string; outcome?: string };
    if (!body.status || !(STATUSES as readonly string[]).includes(body.status)) return Response.json({ message: "Estado inválido." }, { status: 400 });

    const data: { status: typeof STATUSES[number]; completedAt?: Date | null; outcome?: string } = { status: body.status as typeof STATUSES[number] };
    if (body.status === "COMPLETED") data.completedAt = new Date();
    if (isOwner && body.outcome !== undefined) data.outcome = body.outcome;

    const updated = await getPrisma().actionPlan.update({ where: { id }, data });
    return Response.json({ plan: updated });
  } catch (error) { return crmError(error); }
}
