import { crmError, requireCrmContext } from "@/lib/crm-access";
import { isCrmFeatureActive } from "@/lib/vertical-template";
import { requireFinanceRead } from "@/lib/finance-access";
import { getExecutiveDashboard, type ExecutivePreset } from "@/lib/business-consolidation";

const PRESETS = ["today", "this_month", "last_month", "last_30_days", "custom"] as const;

// Shared by both the full Dashboard Ejecutivo (Finanzas) and the lighter Gestión Comercial screen — either tenant
// feature being active is enough to read it; the role gate below is identical either way.
export async function GET(request: Request) { try {
  const context = await requireCrmContext();
  const [financeActive, commercialActive] = await Promise.all([isCrmFeatureActive(context.tenantId, "finance"), isCrmFeatureActive(context.tenantId, "commercial-management")]);
  if (!financeActive && !commercialActive) throw new Response("Función CRM no activa para esta empresa", { status: 403 });
  requireFinanceRead(context.role);
  const search = new URL(request.url).searchParams;
  const preset = search.get("preset") || "this_month";
  if (!PRESETS.includes(preset as never)) throw new Response("Filtro de período inválido", { status: 400 });
  const summary = await getExecutiveDashboard(context.tenantId, {
    preset: preset as ExecutivePreset,
    from: search.get("from") || undefined,
    to: search.get("to") || undefined,
    productId: search.get("productId") || undefined,
    commercialPlanId: search.get("commercialPlanId") || undefined,
    transactionType: search.get("transactionType") || undefined,
    agentId: search.get("agentId") || undefined,
    // A store-scoped supervisor's own store always wins over whatever the client sends — never trust client input for this.
    storeId: context.storeId ?? (search.get("storeId") || undefined),
  });
  return Response.json(summary);
} catch (error) { return crmError(error); } }
