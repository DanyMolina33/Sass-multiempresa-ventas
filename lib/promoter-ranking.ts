import type { DateRange } from "@/lib/business-consolidation";
import { getSalesMetrics } from "@/lib/business-consolidation";
import { getPrisma } from "@/lib/prisma";

export function rankingRange(scope: "today" | "week" | "month"): DateRange {
  const now = new Date();
  if (scope === "today") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }
  if (scope === "week") {
    const day = now.getUTCDay(); // 0=Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
    const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 7);
    return { gte: start, lt: end };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { gte: start, lt: end };
}

// "Mi equipo" = other AGENT users sharing the same supervisor — falls back to a solo ranking of just this user
// when they have no supervisor assigned yet, so it degrades gracefully instead of failing.
export async function teamRanking(tenantId: string, userId: string, range: DateRange) {
  const prisma = getPrisma();
  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { supervisorId: true, name: true } });
  const teammates = currentUser.supervisorId
    ? await prisma.user.findMany({ where: { tenantId, supervisorId: currentUser.supervisorId, status: "ACTIVE", role: { code: "AGENT" } }, select: { id: true, name: true } })
    : [{ id: userId, name: currentUser.name }];
  const ranked = (await Promise.all(teammates.map(async (member) => {
    const metrics = await getSalesMetrics(tenantId, range, { agentId: member.id });
    return { id: member.id, name: member.name, sales: metrics.aprobadas, tasaAprobacion: metrics.tasaAprobacion };
  }))).sort((a, b) => b.sales - a.sales);
  const position = ranked.findIndex((row) => row.id === userId) + 1;
  return { position, total: ranked.length, entries: ranked.map((row) => ({ ...row, isSelf: row.id === userId })) };
}
