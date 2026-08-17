import { crmError, requireCrmContext } from "@/lib/crm-access";
import { economicRuleData, requireEconomicWriteRole } from "@/lib/economic-rule-input";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "commissions"); requireEconomicWriteRole(context.role);
    const { id } = await params, prisma = getPrisma();
    const current = await prisma.economicRule.findFirst({ where: { id, tenantId: context.tenantId } });
    if (!current) throw new Response("Regla fuera del tenant", { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const data = await economicRuleData(context.tenantId, { ...current, ...body, effectiveFrom: body.effectiveFrom ?? current.effectiveFrom.toISOString(), effectiveTo: body.effectiveTo === undefined ? current.effectiveTo?.toISOString() : body.effectiveTo });
    const item = await prisma.economicRule.update({ where: { id }, data });
    return Response.json({ item });
  } catch (error) { return crmError(error); }
}
