import { Prisma, type CompensationCommissionRule, type CompensationCommissionTier, type CompensationComponent, type PensionRegimeRate } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const ZERO = new Prisma.Decimal(0);
type SalesBase = "SALE_AMOUNT" | "RECOGNIZED_AMOUNT" | "EXPECTED_COMPANY_INCOME";
export type SalesBaseTotals = Record<SalesBase, Prisma.Decimal>;

// Any percentage base a commission rule or an INCOME-role component can reference: gross isn't available yet at
// that point in the calculation (income components and commission are exactly what make up gross), so GROSS_AMOUNT
// is intentionally excluded here to avoid a circular definition. DEDUCTION/EMPLOYER_CONTRIBUTION components run
// after gross is final, so they may additionally use GROSS_AMOUNT — see `resolveBaseAfterGross`.
function resolveBaseBeforeGross(base: string | null, baseSalary: Prisma.Decimal | null, salesBaseTotals: SalesBaseTotals): Prisma.Decimal | null {
  if (base === "BASE_SALARY") return baseSalary;
  if (base === "SALE_AMOUNT" || base === "RECOGNIZED_AMOUNT" || base === "EXPECTED_COMPANY_INCOME") return salesBaseTotals[base];
  return null; // GROSS_AMOUNT (or unset) is not resolvable at this stage
}
function resolveBaseAfterGross(base: string | null, baseSalary: Prisma.Decimal | null, grossAmount: Prisma.Decimal, salesBaseTotals: SalesBaseTotals): Prisma.Decimal | null {
  if (base === "GROSS_AMOUNT") return grossAmount;
  return resolveBaseBeforeGross(base, baseSalary, salesBaseTotals);
}

function tierFor(tiers: CompensationCommissionTier[], eligibleCount: number) {
  return tiers.find((tier) => eligibleCount >= tier.minSales && (tier.maxSales === null || eligibleCount <= tier.maxSales)) ?? null;
}

export function calculateCommission(rule: (CompensationCommissionRule & { tiers: CompensationCommissionTier[] }) | null, eligibleCount: number, baseSalary: Prisma.Decimal | null, salesBaseTotals: SalesBaseTotals) {
  if (!rule || !rule.active) return { amount: null as Prisma.Decimal | null, detail: { configured: false } };
  if (rule.calculationType === "FIXED_PER_SALE") {
    if (rule.fixedAmountPerSale === null) return { amount: null, detail: { configured: false, reason: "monto fijo sin configurar" } };
    return { amount: rule.fixedAmountPerSale.mul(eligibleCount), detail: { calculationType: "FIXED_PER_SALE", eligibleCount, fixedAmountPerSale: rule.fixedAmountPerSale.toString() } };
  }
  if (rule.calculationType === "PERCENTAGE") {
    if (rule.percentageValue === null || !rule.percentageBase) return { amount: null, detail: { configured: false, reason: "porcentaje sin base" } };
    const base = resolveBaseBeforeGross(rule.percentageBase, baseSalary, salesBaseTotals);
    if (base === null) return { amount: null, detail: { configured: false, reason: `base ${rule.percentageBase} no disponible` } };
    return { amount: base.mul(rule.percentageValue).div(100), detail: { calculationType: "PERCENTAGE", percentageBase: rule.percentageBase, baseValue: base.toString(), percentageValue: rule.percentageValue.toString() } };
  }
  // TIERED_BY_SALE_COUNT
  const tier = tierFor(rule.tiers, eligibleCount);
  if (!tier) return { amount: null, detail: { configured: false, reason: `sin tramo configurado para ${eligibleCount} ventas` } };
  if (tier.tierCalculationType === "FIXED_PER_SALE") {
    if (tier.fixedAmountPerSale === null) return { amount: null, detail: { configured: false, reason: "tramo sin monto fijo" } };
    return { amount: tier.fixedAmountPerSale.mul(eligibleCount), detail: { calculationType: "TIERED_BY_SALE_COUNT", tier: { minSales: tier.minSales, maxSales: tier.maxSales }, fixedAmountPerSale: tier.fixedAmountPerSale.toString(), eligibleCount } };
  }
  if (tier.percentageValue === null || !tier.percentageBase) return { amount: null, detail: { configured: false, reason: "tramo sin base porcentual" } };
  const base = resolveBaseBeforeGross(tier.percentageBase, baseSalary, salesBaseTotals);
  if (base === null) return { amount: null, detail: { configured: false, reason: `base ${tier.percentageBase} no disponible` } };
  return { amount: base.mul(tier.percentageValue).div(100), detail: { calculationType: "TIERED_BY_SALE_COUNT", tier: { minSales: tier.minSales, maxSales: tier.maxSales }, percentageBase: tier.percentageBase, baseValue: base.toString(), percentageValue: tier.percentageValue.toString() } };
}

function resolveComponent(component: CompensationComponent, resolveBase: (base: string | null) => Prisma.Decimal | null) {
  if (component.calculationType === "FIXED") return component.amount;
  if (component.percentageValue === null || !component.percentageBase) return null;
  const base = resolveBase(component.percentageBase);
  if (base === null) return null;
  return base.mul(component.percentageValue).div(100);
}

function sumNullable(values: Array<Prisma.Decimal | null>) {
  return values.reduce((total: Prisma.Decimal, value) => (value === null ? total : total.add(value)), new Prisma.Decimal(0));
}

export type PayrollCalcInput = {
  employmentType: "EN_PLANILLA" | "FUERA_PLANILLA";
  baseSalary: Prisma.Decimal | null;
  components: CompensationComponent[];
  commissionRule: (CompensationCommissionRule & { tiers: CompensationCommissionTier[] }) | null;
  pensionRegimeRate: PensionRegimeRate | null;
  eligibleSalesCount: number;
  salesBaseTotals: SalesBaseTotals;
};

export function calculateEmployeePayroll(input: PayrollCalcInput) {
  const beforeGross = (base: string | null) => resolveBaseBeforeGross(base, input.baseSalary, input.salesBaseTotals);

  const commission = calculateCommission(input.commissionRule, input.eligibleSalesCount, input.baseSalary, input.salesBaseTotals);

  const activeIncome = input.components.filter((c) => c.role === "INCOME" && c.active);
  const incomeBreakdown = activeIncome.map((component) => ({ id: component.id, name: component.name, category: component.category, amount: resolveComponent(component, beforeGross) }));
  const bonusAmount = sumOrNullIfNoneConfigured(incomeBreakdown.filter((c) => c.category === "BONIFICACION"));
  const mobilityAmount = sumOrNullIfNoneConfigured(incomeBreakdown.filter((c) => c.category === "MOVILIDAD"));
  const otherIncomeAmount = sumOrNullIfNoneConfigured(incomeBreakdown.filter((c) => c.category !== "BONIFICACION" && c.category !== "MOVILIDAD"));

  const grossAmount = (input.baseSalary ?? ZERO).add(commission.amount ?? ZERO).add(bonusAmount ?? ZERO).add(mobilityAmount ?? ZERO).add(otherIncomeAmount ?? ZERO);
  const afterGross = (base: string | null) => resolveBaseAfterGross(base, input.baseSalary, grossAmount, input.salesBaseTotals);

  let pensionDeduction: Prisma.Decimal | null = null;
  let pensionDetail: Record<string, unknown> = { applied: false };
  if (input.employmentType === "EN_PLANILLA" && input.pensionRegimeRate && input.pensionRegimeRate.regime !== "NINGUNO") {
    const rate = input.pensionRegimeRate;
    const totalPct = sumNullable([rate.contributionPercentage, rate.insurancePercentage, rate.commissionPercentage]);
    pensionDeduction = (input.baseSalary ?? ZERO).mul(totalPct).div(100);
    pensionDetail = { applied: true, regime: rate.regime, name: rate.name, contributionPercentage: rate.contributionPercentage?.toString() ?? null, insurancePercentage: rate.insurancePercentage?.toString() ?? null, commissionPercentage: rate.commissionPercentage?.toString() ?? null, appliedOverBaseSalary: (input.baseSalary ?? ZERO).toString() };
  }

  const activeDeductions = input.components.filter((c) => c.role === "DEDUCTION" && c.active);
  const deductionBreakdown = activeDeductions.map((component) => ({ id: component.id, name: component.name, category: component.category, amount: resolveComponent(component, afterGross) }));
  const otherDeductions = sumOrNullIfNoneConfigured(deductionBreakdown);

  const totalWorkerDeductions = (pensionDeduction ?? ZERO).add(otherDeductions ?? ZERO);
  const netAmount = grossAmount.sub(totalWorkerDeductions);

  // Unlike the automatic pension deduction/contribution above (which is specifically the legal payroll regime and
  // stays gated to EN_PLANILLA), employer-contribution components are admin-configured per plan — a company may
  // legitimately assume a cost for a FUERA_PLANILLA worker too (e.g. private insurance for a contractor), so this
  // must not be hardcoded to zero for that employment type; whether it applies is entirely up to the plan's own components.
  const activeEmployerContributions = input.components.filter((c) => c.role === "EMPLOYER_CONTRIBUTION" && c.active);
  const employerBreakdown = activeEmployerContributions.map((component) => ({ id: component.id, name: component.name, category: component.category, amount: resolveComponent(component, afterGross) }));
  const employerContributionsAmount = sumNullable(employerBreakdown.map((c) => c.amount));

  const totalCompanyCost = grossAmount.add(employerContributionsAmount);

  return {
    baseSalary: input.baseSalary,
    commissionAmount: commission.amount,
    bonusAmount, mobilityAmount, otherIncomeAmount,
    grossAmount,
    pensionDeduction, otherDeductions, totalWorkerDeductions,
    netAmount,
    employerContributionsAmount,
    totalCompanyCost,
    snapshot: {
      employmentType: input.employmentType,
      eligibleSalesCount: input.eligibleSalesCount,
      salesBaseTotals: { SALE_AMOUNT: input.salesBaseTotals.SALE_AMOUNT.toString(), RECOGNIZED_AMOUNT: input.salesBaseTotals.RECOGNIZED_AMOUNT.toString(), EXPECTED_COMPANY_INCOME: input.salesBaseTotals.EXPECTED_COMPANY_INCOME.toString() },
      commission: commission.detail,
      income: incomeBreakdown.map((c) => ({ ...c, amount: c.amount?.toString() ?? null })),
      pension: pensionDetail,
      deductions: deductionBreakdown.map((c) => ({ ...c, amount: c.amount?.toString() ?? null })),
      employerContributions: employerBreakdown.map((c) => ({ ...c, amount: c.amount?.toString() ?? null })),
    },
  };
}

// A component's own resolved amount preserves null ("sin configurar") vs a real 0. When summing several such
// components for a KPI column, null entries are excluded (mirrors SQL SUM); if there is not a single active,
// resolvable component contributing, the aggregate itself stays null rather than becoming a manufactured zero.
function sumOrNullIfNoneConfigured(entries: Array<{ amount: Prisma.Decimal | null }>) {
  const resolved = entries.filter((e) => e.amount !== null);
  if (!resolved.length) return null;
  return sumNullable(resolved.map((e) => e.amount));
}

const RECOGNIZED_STATUSES = ["CONFORME", "DIFERENCIA"] as const;

export async function computeEligibleSalesForEmployee(tenantId: string, userId: string | null, roleCode: string | undefined, eligibility: "SALE_APPROVED" | "SALE_RECOGNIZED", periodStart: Date, periodEnd: Date) {
  if (!userId) return { count: 0, salesBaseTotals: { SALE_AMOUNT: new Prisma.Decimal(0), RECOGNIZED_AMOUNT: new Prisma.Decimal(0), EXPECTED_COMPANY_INCOME: new Prisma.Decimal(0) } satisfies SalesBaseTotals };
  const prisma = getPrisma();
  const scopeField = roleCode === "SUPERVISOR" ? "supervisorId" : roleCode === "AGENT" ? "agentId" : null;
  if (!scopeField) return { count: 0, salesBaseTotals: { SALE_AMOUNT: new Prisma.Decimal(0), RECOGNIZED_AMOUNT: new Prisma.Decimal(0), EXPECTED_COMPANY_INCOME: new Prisma.Decimal(0) } satisfies SalesBaseTotals };

  const eligibilityWhere: Prisma.SaleWhereInput = eligibility === "SALE_APPROVED"
    ? { status: { in: ["APROBADA", "ACTIVADA"] } }
    : { reconciliationResults: { some: { status: { in: [...RECOGNIZED_STATUSES] }, recognizedAmount: { not: null } } } };

  const sales = await prisma.sale.findMany({
    where: { tenantId, [scopeField]: userId, saleDate: { gte: periodStart, lt: periodEnd }, ...eligibilityWhere },
    select: { id: true, saleAmount: true, economicCalculations: { where: { current: true }, select: { expectedCompanyIncome: true }, take: 1 }, reconciliationResults: { where: { status: { in: [...RECOGNIZED_STATUSES] } }, select: { recognizedAmount: true } } },
  });

  const saleAmountTotal = sales.reduce((total, sale) => sale.saleAmount ? total.add(sale.saleAmount) : total, new Prisma.Decimal(0));
  const recognizedTotal = sales.reduce((total, sale) => sale.reconciliationResults.reduce((inner, r) => r.recognizedAmount ? inner.add(r.recognizedAmount) : inner, total), new Prisma.Decimal(0));
  const expectedTotal = sales.reduce((total, sale) => sale.economicCalculations[0]?.expectedCompanyIncome ? total.add(sale.economicCalculations[0].expectedCompanyIncome) : total, new Prisma.Decimal(0));

  return { count: sales.length, salesBaseTotals: { SALE_AMOUNT: saleAmountTotal, RECOGNIZED_AMOUNT: recognizedTotal, EXPECTED_COMPANY_INCOME: expectedTotal } satisfies SalesBaseTotals };
}

export async function calculateAndSnapshotPayrollEntry(tenantId: string, payrollPeriodId: string, employeeId: string) {
  const prisma = getPrisma();
  const period = await prisma.payrollPeriod.findFirstOrThrow({ where: { id: payrollPeriodId, tenantId } });
  if (period.status === "CLOSED" || period.status === "PAID") throw new Response("El período ya está cerrado; no admite recálculo", { status: 409 });
  const employee = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, tenantId }, include: { user: { include: { role: true } }, pensionRegimeRate: true, compensationPlan: { include: { components: true, commissionRule: { include: { tiers: true } } } } } });

  const eligibility = employee.compensationPlan.commissionRule?.eligibility ?? "SALE_APPROVED";
  const { count, salesBaseTotals } = await computeEligibleSalesForEmployee(tenantId, employee.userId, employee.user?.role.code, eligibility, period.periodStart, period.periodEnd);

  const result = calculateEmployeePayroll({
    employmentType: employee.employmentType,
    baseSalary: employee.compensationPlan.baseSalary,
    components: employee.compensationPlan.components,
    commissionRule: employee.compensationPlan.commissionRule,
    pensionRegimeRate: employee.pensionRegimeRate,
    eligibleSalesCount: count,
    salesBaseTotals,
  });

  return prisma.$transaction(async (tx) => {
    const latest = await tx.payrollEntry.findFirst({ where: { payrollPeriodId, employeeId }, orderBy: { revision: "desc" }, select: { revision: true } });
    await tx.payrollEntry.updateMany({ where: { payrollPeriodId, employeeId, current: true }, data: { current: false } });
    return tx.payrollEntry.create({ data: {
      tenantId, payrollPeriodId, employeeId, compensationPlanId: employee.compensationPlanId,
      revision: (latest?.revision ?? 0) + 1, current: true,
      eligibleSalesCount: count,
      baseSalary: result.baseSalary, commissionAmount: result.commissionAmount, bonusAmount: result.bonusAmount, mobilityAmount: result.mobilityAmount, otherIncomeAmount: result.otherIncomeAmount,
      grossAmount: result.grossAmount,
      pensionDeduction: result.pensionDeduction, otherDeductions: result.otherDeductions, totalWorkerDeductions: result.totalWorkerDeductions,
      netAmount: result.netAmount,
      employerContributionsAmount: result.employerContributionsAmount,
      totalCompanyCost: result.totalCompanyCost,
      calculationSnapshot: result.snapshot as Prisma.InputJsonValue,
    } });
  });
}

export async function recalculatePayrollPeriod(tenantId: string, payrollPeriodId: string) {
  const prisma = getPrisma();
  const employees = await prisma.employee.findMany({ where: { tenantId, status: "ACTIVE" }, select: { id: true } });
  const entries = [];
  for (const employee of employees) entries.push(await calculateAndSnapshotPayrollEntry(tenantId, payrollPeriodId, employee.id));
  return entries;
}
