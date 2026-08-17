import type { DateRange } from "@/lib/business-consolidation";
import { getSalesMetrics } from "@/lib/business-consolidation";
import { getPrisma } from "@/lib/prisma";

// Real subordinates only (User.supervisorId = supervisorId), never "shares my supervisor" — that's the AGENT-facing
// query in lib/promoter-ranking.ts, a different relationship.
export async function getSubordinates(tenantId: string, supervisorId: string) {
  return getPrisma().user.findMany({
    where: { tenantId, supervisorId, status: "ACTIVE", role: { code: "AGENT" } },
    select: { id: true, name: true, email: true, employee: { select: { id: true, jobPosition: { select: { name: true } }, store: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });
}

export async function supervisorTeamRanking(tenantId: string, supervisorId: string, range: DateRange) {
  const team = await getSubordinates(tenantId, supervisorId);
  const ranked = (await Promise.all(team.map(async (member) => {
    const metrics = await getSalesMetrics(tenantId, range, { agentId: member.id });
    return { id: member.id, name: member.name, sales: metrics.aprobadas, tasaAprobacion: metrics.tasaAprobacion };
  }))).sort((a, b) => b.sales - a.sales);
  return { total: ranked.length, entries: ranked.map((row) => ({ ...row, isSelf: false })) };
}

// Ranking de Supervisores (section 33/34): primary metric = aggregate approved sales of their team; secondary
// (documented, section 34) = own personal production, shown but not summed into the primary ranking number.
export async function supervisorsRanking(tenantId: string, requestingSupervisorId: string, range: DateRange) {
  const prisma = getPrisma();
  const supervisors = await prisma.user.findMany({ where: { tenantId, status: "ACTIVE", role: { code: "SUPERVISOR" } }, select: { id: true, name: true } });
  const ranked = (await Promise.all(supervisors.map(async (sup) => {
    const team = await getSubordinates(tenantId, sup.id);
    const teamMetrics = await Promise.all(team.map((member) => getSalesMetrics(tenantId, range, { agentId: member.id })));
    const teamSales = teamMetrics.reduce((sum, m) => sum + m.aprobadas, 0);
    const ownMetrics = await getSalesMetrics(tenantId, range, { agentId: sup.id });
    return { id: sup.id, name: sup.name, teamSales, ownSales: ownMetrics.aprobadas, teamSize: team.length };
  }))).sort((a, b) => b.teamSales - a.teamSales);
  const position = ranked.findIndex((row) => row.id === requestingSupervisorId) + 1;
  return { position, total: ranked.length, entries: ranked.map((row) => ({ ...row, isSelf: row.id === requestingSupervisorId })) };
}
