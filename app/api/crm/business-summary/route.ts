import { crmError, requireCrmContext } from "@/lib/crm-access";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireFinanceRead } from "@/lib/finance-access";
import { getBusinessSummary } from "@/lib/business-consolidation";

// The single consolidated read-model for Sales + Liquidaciones + Finanzas + Pago de Personal. Built so a future
// Dashboard Ejecutivo (and, scoped narrower, a Portal Promotor / Vista Tienda) can consume one server-computed
// result instead of re-deriving these formulas in the frontend.
export async function GET(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceRead(context.role);
  const search = new URL(request.url).searchParams;
  const summary = await getBusinessSummary(context.tenantId, {
    period: search.get("period") || undefined,
    day: search.get("day") || undefined,
    productId: search.get("productId") || undefined,
    commercialPlanId: search.get("commercialPlanId") || undefined,
    transactionType: search.get("transactionType") || undefined,
    agentId: search.get("agentId") || undefined,
    supervisorId: search.get("supervisorId") || undefined,
    storeId: search.get("storeId") || undefined,
  });
  return Response.json(summary);
} catch (error) { return crmError(error); } }
