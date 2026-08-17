import { Prisma, type EconomicRule, type Sale } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const ECONOMIC_RULE_PRIORITY = [
  "Producto + Plan + Operación",
  "Producto + Plan",
  "Producto + Operación",
  "Producto",
  "Plan + Operación",
  "Plan",
  "Operación",
  "Regla general",
] as const;

type SaleForEconomics = Pick<Sale, "id" | "tenantId" | "productId" | "commercialPlanId" | "transactionType" | "saleDate" | "saleAmount" | "fixedChargeSnapshot" | "agentId" | "supervisorId" | "historicalAdvisorName" | "historicalSupervisorName">;

function specificity(rule: Pick<EconomicRule, "productId" | "commercialPlanId" | "transactionType">) {
  // Dimension count dominates first (a 2-field match always outranks any single-field match), then this
  // per-field weight breaks ties within the same dimension count — reproducing the exact 8-step priority order:
  // producto+plan+operación > producto+plan > producto+operación > plan+operación > producto > plan > operación > general.
  const dimensions = (rule.productId ? 1 : 0) + (rule.commercialPlanId ? 1 : 0) + (rule.transactionType ? 1 : 0);
  const tiebreak = (rule.productId ? 4 : 0) + (rule.commercialPlanId ? 2 : 0) + (rule.transactionType ? 1 : 0);
  return dimensions * 100 + tiebreak;
}

export function ruleMatchesSale(rule: EconomicRule, sale: SaleForEconomics) {
  const saleDay = sale.saleDate.getTime();
  return rule.tenantId === sale.tenantId && rule.active &&
    (!rule.productId || rule.productId === sale.productId) &&
    (!rule.commercialPlanId || rule.commercialPlanId === sale.commercialPlanId) &&
    (!rule.transactionType || rule.transactionType === sale.transactionType) &&
    rule.effectiveFrom.getTime() <= saleDay &&
    (!rule.effectiveTo || rule.effectiveTo.getTime() >= saleDay);
}

export function resolveEconomicRule(rules: EconomicRule[], sale: SaleForEconomics) {
  const matching = rules.filter((rule) => ruleMatchesSale(rule, sale));
  if (!matching.length) return { rule: null, ambiguous: false, matchingRuleIds: [] as string[] };
  const bestScore = Math.max(...matching.map(specificity));
  const best = matching.filter((rule) => specificity(rule) === bestScore);
  return { rule: best.length === 1 ? best[0] : null, ambiguous: best.length > 1, matchingRuleIds: best.map((rule) => rule.id) };
}

function component(type: EconomicRule["expectedCompanyIncomeType"], value: Prisma.Decimal | null, base: Prisma.Decimal | null) {
  if (!type || value === null) return { amount: null, review: false };
  if (type === "FIXED") return { amount: value, review: false };
  if (base === null) return { amount: null, review: true };
  return { amount: base.mul(value).div(100), review: false };
}

export function calculateSaleEconomics(sale: SaleForEconomics, rules: EconomicRule[], options: { agentIsSupervisorWithoutSuperior?: boolean } = {}) {
  const resolution = resolveEconomicRule(rules, sale);
  const inputSnapshot = {
    productId: sale.productId,
    commercialPlanId: sale.commercialPlanId,
    transactionType: sale.transactionType,
    saleDate: sale.saleDate.toISOString(),
    percentageBase: "saleAmount",
    saleAmount: sale.saleAmount?.toString() ?? null,
    fixedChargeSnapshot: sale.fixedChargeSnapshot?.toString() ?? null,
    historicalAdvisorName: sale.historicalAdvisorName,
    historicalSupervisorName: sale.historicalSupervisorName,
  };
  if (resolution.ambiguous) return { economicRuleId: null, expectedCompanyIncome: null, promoterCommission: null, supervisorCommission: null, preliminaryMargin: null, calculationStatus: "REQUIRES_REVIEW" as const, ruleSnapshot: { ambiguousRuleIds: resolution.matchingRuleIds }, inputSnapshot };
  if (!resolution.rule) return { economicRuleId: null, expectedCompanyIncome: null, promoterCommission: null, supervisorCommission: null, preliminaryMargin: null, calculationStatus: "PENDING_RULE" as const, ruleSnapshot: null, inputSnapshot };

  const rule = resolution.rule;
  const company = component(rule.expectedCompanyIncomeType, rule.expectedCompanyIncomeValue, sale.saleAmount);
  const promoter = component(rule.promoterCommissionType, rule.promoterCommissionValue, sale.saleAmount);
  // A SUPERVISOR selling personally has no one above them by design — they are never auto-assigned as their own
  // supervisor (lib/crm-access.ts). Any supervisor-override commission the rule specifies has no legitimate
  // recipient in that case: NOT_APPLICABLE (treated as null, like an unconfigured component), not a missing
  // assignment an admin needs to fix. A regular AGENT/Promotor sale with no supervisorId still needs one (decision
  // #3 of the 2026-08-17 Final Gate closure: "no modificar la comisión de ventas realizadas por sus Promotores").
  const supervisorNotApplicable = Boolean(options.agentIsSupervisorWithoutSuperior && !sale.supervisorId);
  const supervisor = supervisorNotApplicable ? { amount: null, review: false } : component(rule.supervisorCommissionType, rule.supervisorCommissionValue, sale.saleAmount);
  const incompleteConfiguration = !rule.expectedCompanyIncomeType || rule.expectedCompanyIncomeValue === null;
  const requiresReview = incompleteConfiguration || company.review || promoter.review || supervisor.review;
  const pendingAssignment = (promoter.amount !== null && !sale.agentId) || (!supervisorNotApplicable && supervisor.amount !== null && !sale.supervisorId);
  const preliminaryMargin = company.amount === null ? null : company.amount.sub(promoter.amount ?? 0).sub(supervisor.amount ?? 0);
  return {
    economicRuleId: rule.id,
    expectedCompanyIncome: company.amount,
    promoterCommission: promoter.amount,
    supervisorCommission: supervisor.amount,
    preliminaryMargin,
    calculationStatus: requiresReview ? "REQUIRES_REVIEW" as const : pendingAssignment ? "PENDING_ASSIGNMENT" as const : "CALCULATED" as const,
    ruleSnapshot: {
      id: rule.id, name: rule.name, code: rule.code,
      productId: rule.productId, commercialPlanId: rule.commercialPlanId, transactionType: rule.transactionType,
      effectiveFrom: rule.effectiveFrom.toISOString(), effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      expectedCompanyIncomeType: rule.expectedCompanyIncomeType, expectedCompanyIncomeValue: rule.expectedCompanyIncomeValue?.toString() ?? null,
      promoterCommissionType: rule.promoterCommissionType, promoterCommissionValue: rule.promoterCommissionValue?.toString() ?? null,
      supervisorCommissionType: rule.supervisorCommissionType, supervisorCommissionValue: rule.supervisorCommissionValue?.toString() ?? null,
      percentageBase: "saleAmount",
    },
    inputSnapshot,
  };
}

export async function calculateAndSnapshotSale(saleId: string, tenantId: string, options: { recalculate?: boolean } = {}) {
  const prisma = getPrisma();
  const sale = await prisma.sale.findFirst({ where: { id: saleId, tenantId }, include: { agent: { select: { role: { select: { code: true } } } } } });
  if (!sale) throw new Response("Venta fuera del tenant", { status: 403 });
  const existing = await prisma.saleEconomicCalculation.findFirst({ where: { saleId, tenantId, current: true }, orderBy: { revision: "desc" } });
  if (existing && !options.recalculate) return existing;
  const rules = await prisma.economicRule.findMany({ where: { tenantId, active: true } });
  const agentIsSupervisorWithoutSuperior = sale.agent?.role.code === "SUPERVISOR";
  const result = calculateSaleEconomics(sale, rules, { agentIsSupervisorWithoutSuperior });
  return prisma.$transaction(async (tx) => {
    const latest = await tx.saleEconomicCalculation.findFirst({ where: { saleId, tenantId }, orderBy: { revision: "desc" }, select: { revision: true } });
    await tx.saleEconomicCalculation.updateMany({ where: { saleId, tenantId, current: true }, data: { current: false } });
    return tx.saleEconomicCalculation.create({ data: {
      tenantId, saleId, revision: (latest?.revision ?? 0) + 1, current: true,
      economicRuleId: result.economicRuleId,
      expectedCompanyIncome: result.expectedCompanyIncome,
      promoterCommission: result.promoterCommission,
      supervisorCommission: result.supervisorCommission,
      preliminaryMargin: result.preliminaryMargin,
      calculationStatus: result.calculationStatus,
      promoterUserId: sale.agentId,
      supervisorUserId: sale.supervisorId,
      historicalAdvisorName: sale.historicalAdvisorName,
      historicalSupervisorName: sale.historicalSupervisorName,
      ruleSnapshot: result.ruleSnapshot ?? Prisma.JsonNull,
      inputSnapshot: result.inputSnapshot,
    } });
  });
}

export async function initializePendingEconomicsForTenant(tenantId: string) {
  const prisma = getPrisma();
  const saleIds = await prisma.sale.findMany({ where: { tenantId, economicCalculations: { none: {} } }, select: { id: true } });
  for (const sale of saleIds) await calculateAndSnapshotSale(sale.id, tenantId);
  return saleIds.length;
}
