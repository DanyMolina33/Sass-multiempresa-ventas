import { crmError, requireCrmContext } from "@/lib/crm-access";
import { rankingRange } from "@/lib/promoter-ranking";
import { supervisorTeamRanking, supervisorsRanking } from "@/lib/supervisor-team";

const SCOPES = ["today", "week", "month"] as const;
const TYPES = ["promoters", "supervisors"] as const;

// Section 32 (ranking de mis Promotores) and 33/34 (ranking entre Supervisores, agregados solamente — nunca abre
// el equipo de otro Supervisor, que es exactamente lo que supervisorsRanking() expone: nombre/posición/ventas
// equipo, nada más).
export async function GET(request: Request) {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const search = new URL(request.url).searchParams;
    const scope = (SCOPES as readonly string[]).includes(search.get("range") ?? "") ? (search.get("range") as typeof SCOPES[number]) : "month";
    const type = (TYPES as readonly string[]).includes(search.get("type") ?? "") ? (search.get("type") as typeof TYPES[number]) : "promoters";
    const range = rankingRange(scope);
    if (type === "supervisors") return Response.json(await supervisorsRanking(context.tenantId, context.userId, range));
    return Response.json(await supervisorTeamRanking(context.tenantId, context.userId, range));
  } catch (error) { return crmError(error); }
}
