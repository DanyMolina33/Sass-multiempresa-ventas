import { crmError, requireCrmContext } from "@/lib/crm-access";
import { economicRuleData, requireEconomicReadRole, requireEconomicWriteRole } from "@/lib/economic-rule-input";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function GET(request: Request) {
  try {
    const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "commissions"); requireEconomicReadRole(context.role);
    const search = new URL(request.url).searchParams;
    const items = await getPrisma().economicRule.findMany({ where: {
      tenantId: context.tenantId,
      ...(search.get("productId") ? { productId: search.get("productId")! } : {}),
      ...(search.get("commercialPlanId") ? { commercialPlanId: search.get("commercialPlanId")! } : {}),
      ...(search.get("transactionType") ? { transactionType: search.get("transactionType") as never } : {}),
    }, include: { product: { select: { id: true, name: true } }, commercialPlan: { select: { id: true, name: true } }, _count: { select: { calculations: true } } }, orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }] });
    return Response.json({ items });
  } catch (error) { return crmError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "commissions"); requireEconomicWriteRole(context.role);
    const data = await economicRuleData(context.tenantId, await request.json());
    const item = await getPrisma().economicRule.create({ data, include: { product: true, commercialPlan: true } });
    return Response.json({ item }, { status: 201 });
  } catch (error) { return crmError(error); }
}
