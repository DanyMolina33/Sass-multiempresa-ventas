import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelWrite } from "@/lib/payroll-access";
import { compensationPlanData } from "@/lib/payroll-input";

const planInclude = { commissionRule: { include: { tiers: true } }, components: true, _count: { select: { employees: true } } } as const;

// PATCH fully replaces the plan's configuration (fields + nested commission rule/tiers + components). This never
// touches already-CLOSED PayrollEntry rows — those carry their own frozen calculationSnapshot — so editing a plan
// can never retroactively alter a historical, consolidated payroll period.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const { id } = await params, prisma = getPrisma();
  const current = await prisma.compensationPlan.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Plan fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const { plan, commissionRule, components } = compensationPlanData(body);
  if (plan.code !== current.code) {
    const clash = await prisma.compensationPlan.findFirst({ where: { tenantId: context.tenantId, code: plan.code, id: { not: id } } });
    if (clash) throw new Response("Ya existe un plan con ese código", { status: 409 });
  }
  const item = await prisma.$transaction(async (tx) => {
    await tx.compensationPlan.update({ where: { id }, data: plan });
    await tx.compensationCommissionRule.deleteMany({ where: { compensationPlanId: id } });
    await tx.compensationComponent.deleteMany({ where: { compensationPlanId: id } });
    if (commissionRule) await tx.compensationCommissionRule.create({ data: { tenantId: context.tenantId, compensationPlanId: id, calculationType: commissionRule.calculationType as never, eligibility: commissionRule.eligibility as never, fixedAmountPerSale: commissionRule.fixedAmountPerSale, percentageValue: commissionRule.percentageValue, percentageBase: commissionRule.percentageBase as never, active: commissionRule.active, tiers: { create: commissionRule.tiers.map((tier) => ({ tenantId: context.tenantId, minSales: tier.minSales, maxSales: tier.maxSales, tierCalculationType: tier.tierCalculationType as never, fixedAmountPerSale: tier.fixedAmountPerSale, percentageValue: tier.percentageValue, percentageBase: tier.percentageBase as never })) } } });
    if (components.length) await tx.compensationComponent.createMany({ data: components.map((component) => ({ tenantId: context.tenantId, compensationPlanId: id, role: component.role as never, category: component.category, name: component.name, calculationType: component.calculationType as never, amount: component.amount, percentageValue: component.percentageValue, percentageBase: component.percentageBase as never, active: component.active })) });
    return tx.compensationPlan.findUniqueOrThrow({ where: { id }, include: planInclude });
  });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
