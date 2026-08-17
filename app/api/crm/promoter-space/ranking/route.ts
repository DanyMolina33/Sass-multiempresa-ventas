import { crmError, requireCrmContext } from "@/lib/crm-access";
import { requireCrmFeature } from "@/lib/vertical-template";
import { rankingRange, teamRanking } from "@/lib/promoter-ranking";

const SCOPES = ["today", "week", "month"] as const;

export async function GET(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "promoter-space");
  const requested = new URL(request.url).searchParams.get("range");
  const scope = (SCOPES as readonly string[]).includes(requested ?? "") ? (requested as typeof SCOPES[number]) : "month";
  const ranking = await teamRanking(context.tenantId, context.userId, rankingRange(scope));
  return Response.json({ scope, ...ranking });
} catch (error) { return crmError(error); } }
