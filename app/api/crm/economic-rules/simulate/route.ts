import { crmError, requireCrmContext } from "@/lib/crm-access";
import { economicRuleData, requireEconomicReadRole } from "@/lib/economic-rule-input";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function POST(request: Request) {
  try {
    const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "commissions"); requireEconomicReadRole(context.role);
    const data = await economicRuleData(context.tenantId, await request.json());
    const where = { tenantId: context.tenantId, saleDate: { gte: data.effectiveFrom, ...(data.effectiveTo ? { lte: data.effectiveTo } : {}) }, ...(data.productId ? { productId: data.productId } : {}), ...(data.commercialPlanId ? { commercialPlanId: data.commercialPlanId } : {}), ...(data.transactionType ? { transactionType: data.transactionType } : {}) };
    const [count, period] = await Promise.all([getPrisma().sale.count({ where }), getPrisma().sale.aggregate({ where, _min: { saleDate: true }, _max: { saleDate: true } })]);
    return Response.json({ count, periodFrom: period._min.saleDate, periodTo: period._max.saleDate, productId: data.productId, commercialPlanId: data.commercialPlanId, transactionType: data.transactionType });
  } catch (error) { return crmError(error); }
}
