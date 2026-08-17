import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";
import { compensationPlanData } from "@/lib/payroll-input";

const planInclude = { commissionRule: { include: { tiers: true } }, components: true, _count: { select: { employees: true } } } as const;

export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const items = await getPrisma().compensationPlan.findMany({ where: { tenantId: context.tenantId }, include: planInclude, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const { plan, commissionRule, components } = compensationPlanData(body);
  const existing = await getPrisma().compensationPlan.findFirst({ where: { tenantId: context.tenantId, code: plan.code } });
  if (existing) throw new Response("Ya existe un plan con ese código", { status: 409 });
  const item = await getPrisma().compensationPlan.create({
    data: {
      tenantId: context.tenantId, ...plan,
      commissionRule: commissionRule ? { create: { tenantId: context.tenantId, calculationType: commissionRule.calculationType as never, eligibility: commissionRule.eligibility as never, fixedAmountPerSale: commissionRule.fixedAmountPerSale, percentageValue: commissionRule.percentageValue, percentageBase: commissionRule.percentageBase as never, active: commissionRule.active, tiers: { create: commissionRule.tiers.map((tier) => ({ tenantId: context.tenantId, minSales: tier.minSales, maxSales: tier.maxSales, tierCalculationType: tier.tierCalculationType as never, fixedAmountPerSale: tier.fixedAmountPerSale, percentageValue: tier.percentageValue, percentageBase: tier.percentageBase as never })) } } } : undefined,
      components: { create: components.map((component) => ({ tenantId: context.tenantId, role: component.role as never, category: component.category, name: component.name, calculationType: component.calculationType as never, amount: component.amount, percentageValue: component.percentageValue, percentageBase: component.percentageBase as never, active: component.active })) },
    },
    include: planInclude,
  });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
