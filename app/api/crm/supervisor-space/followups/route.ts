import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getSubordinates } from "@/lib/supervisor-team";

// Section 50 — team-wide seguimientos summary, derived straight from FollowUp (no parallel table).
export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const prisma = getPrisma();
    const team = await getSubordinates(context.tenantId, context.userId);
    const teamIds = team.map((m) => m.id);
    if (!teamIds.length) return Response.json({ summary: { programados: 0, completados: 0, pendientes: 0, vencidos: 0 }, byPromoter: [] });
    const now = new Date();
    const [items, counts] = await Promise.all([
      prisma.followUp.findMany({ where: { tenantId: context.tenantId, assignedUserId: { in: teamIds } }, select: { id: true, assignedUserId: true, scheduledAt: true, status: true, type: true, customer: { select: { name: true } } }, orderBy: { scheduledAt: "asc" } }),
      prisma.followUp.groupBy({ by: ["status"], where: { tenantId: context.tenantId, assignedUserId: { in: teamIds } }, _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>;
    const vencidos = items.filter((i) => i.status === "PENDING" && i.scheduledAt < now).length;
    const nameById = new Map(team.map((m) => [m.id, m.name]));
    const byPromoter = team.map((m) => {
      const mine = items.filter((i) => i.assignedUserId === m.id);
      return { id: m.id, name: m.name, programados: mine.length, completados: mine.filter((i) => i.status === "COMPLETED").length, pendientes: mine.filter((i) => i.status === "PENDING").length, vencidos: mine.filter((i) => i.status === "PENDING" && i.scheduledAt < now).length };
    });
    return Response.json({
      summary: { programados: items.length, completados: byStatus.COMPLETED ?? 0, pendientes: byStatus.PENDING ?? 0, vencidos },
      byPromoter,
      items: items.map((i) => ({ ...i, promoterName: nameById.get(i.assignedUserId) ?? "—" })),
    });
  } catch (error) { return crmError(error); }
}
