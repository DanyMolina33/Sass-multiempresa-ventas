import { Prisma, type CompensationComponent, type PensionRegimeRate } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { APPROVED_SALE_STATUSES } from "@/lib/business-consolidation";

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

// Final Gate closure (2026-08-17), decision #1/#4: CompensationCommissionRule/Tier are retired as a commission
// SOURCE — confirmed empty tenant-wide, and the historical PAID PayrollEntry.commissionAmount values (mayo/junio/
// julio 2026) were proven (exact match, aggregate AND per-sale) to trace back to the SAME EconomicRule percentages
// that already drive SaleEconomicCalculation, via the orphaned Settlement/CommissionEarned ledger — never through
// this rule-based path. SaleEconomicCalculation.promoterCommission/supervisorCommission is now the single official
// source Payroll consolidates from; this file no longer computes a second, independent commission figure.
// CompensationCommissionRule/CompensationCommissionTier stay in the schema (still editable via the Compensation
// Plans admin UI) but have no effect on payroll math anymore — see FINAL_GATE_AUDIT.md.
export type EconomicCommissionLine = { saleId: string; role: "PROMOTER" | "SUPERVISOR"; amount: string };

export async function deriveEconomicCommission(tenantId: string, userId: string | null, periodStart: Date, periodEnd: Date): Promise<{ amount: Prisma.Decimal | null; breakdown: EconomicCommissionLine[] }> {
  if (!userId) return { amount: null, breakdown: [] };
  const prisma = getPrisma();
  const [ownSales, supervisedSales] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId, agentId: userId, saleDate: { gte: periodStart, lt: periodEnd }, status: { in: [...APPROVED_SALE_STATUSES] } },
      select: { id: true, economicCalculations: { where: { current: true }, select: { promoterCommission: true }, take: 1 } },
    }),
    prisma.sale.findMany({
      where: { tenantId, supervisorId: userId, saleDate: { gte: periodStart, lt: periodEnd }, status: { in: [...APPROVED_SALE_STATUSES] } },
      select: { id: true, economicCalculations: { where: { current: true }, select: { supervisorCommission: true }, take: 1 } },
    }),
  ]);
  const breakdown: EconomicCommissionLine[] = [
    ...ownSales.flatMap((sale) => { const amount = sale.economicCalculations[0]?.promoterCommission; return amount != null ? [{ saleId: sale.id, role: "PROMOTER" as const, amount: amount.toString() }] : []; }),
    ...supervisedSales.flatMap((sale) => { const amount = sale.economicCalculations[0]?.supervisorCommission; return amount != null ? [{ saleId: sale.id, role: "SUPERVISOR" as const, amount: amount.toString() }] : []; }),
  ];
  if (!breakdown.length) return { amount: null, breakdown };
  return { amount: breakdown.reduce((total, line) => total.add(line.amount), new Prisma.Decimal(0)), breakdown };
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
  commission: { amount: Prisma.Decimal | null; breakdown: EconomicCommissionLine[] };
  pensionRegimeRate: PensionRegimeRate | null;
  eligibleSalesCount: number;
  salesBaseTotals: SalesBaseTotals;
};

export function calculateEmployeePayroll(input: PayrollCalcInput) {
  const beforeGross = (base: string | null) => resolveBaseBeforeGross(base, input.baseSalary, input.salesBaseTotals);

  const commission = input.commission;

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
      commission: { amount: commission.amount?.toString() ?? null, breakdown: commission.breakdown },
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

// "Eligible" here means SALE_APPROVED only (decision #1/#4) — reuses the canonical APPROVED_SALE_STATUSES
// definition instead of an independent literal. This feeds eligibleSalesCount/salesBaseTotals, which other
// (non-commission) components on a plan may still reference as a percentage base — commission itself now comes
// from deriveEconomicCommission, not from these totals.
export async function computeEligibleSalesForEmployee(tenantId: string, userId: string | null, roleCode: string | undefined, periodStart: Date, periodEnd: Date) {
  if (!userId) return { count: 0, salesBaseTotals: { SALE_AMOUNT: new Prisma.Decimal(0), RECOGNIZED_AMOUNT: new Prisma.Decimal(0), EXPECTED_COMPANY_INCOME: new Prisma.Decimal(0) } satisfies SalesBaseTotals };
  const prisma = getPrisma();
  const scopeField = roleCode === "SUPERVISOR" ? "supervisorId" : roleCode === "AGENT" ? "agentId" : null;
  if (!scopeField) return { count: 0, salesBaseTotals: { SALE_AMOUNT: new Prisma.Decimal(0), RECOGNIZED_AMOUNT: new Prisma.Decimal(0), EXPECTED_COMPANY_INCOME: new Prisma.Decimal(0) } satisfies SalesBaseTotals };

  const sales = await prisma.sale.findMany({
    where: { tenantId, [scopeField]: userId, saleDate: { gte: periodStart, lt: periodEnd }, status: { in: [...APPROVED_SALE_STATUSES] } },
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
  const employee = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, tenantId }, include: { user: { include: { role: true } }, pensionRegimeRate: true, compensationPlan: { include: { components: true } } } });

  const [{ count, salesBaseTotals }, commission] = await Promise.all([
    computeEligibleSalesForEmployee(tenantId, employee.userId, employee.user?.role.code, period.periodStart, period.periodEnd),
    deriveEconomicCommission(tenantId, employee.userId, period.periodStart, period.periodEnd),
  ]);

  const result = calculateEmployeePayroll({
    employmentType: employee.employmentType,
    baseSalary: employee.compensationPlan.baseSalary,
    components: employee.compensationPlan.components,
    commission,
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

export type CommissionSummary = {
  currentPeriod: { amount: number; periodCode: string; status: "OPEN" | "REVIEWED" } | null;
  lastPaid: { amount: number; periodCode: string; periodEnd: string } | null;
};

// Final Gate closure (2026-08-17), decision #6/31C: the Portal previously took only the single most recent
// CLOSED/PAID PayrollEntry, so a period with a real historical commission (e.g. mayo, S/133.37) went invisible
// the moment a LATER period closed with no commission (e.g. julio, null) — "Sin datos" despite real paid money.
// Now returns both concepts separately: the still-open current period (may legitimately be 0) and the most
// recent period that actually had a real paid/confirmed commission, however far back that is. Never summed —
// each widget shows one period at a time, per the approved UX decision.
export async function getCommissionSummary(tenantId: string, employeeId: string): Promise<CommissionSummary> {
  const prisma = getPrisma();
  const [currentEntry, lastPaidEntry] = await Promise.all([
    prisma.payrollEntry.findFirst({ where: { tenantId, employeeId, current: true, payrollPeriod: { status: { in: ["OPEN", "REVIEWED"] } } }, orderBy: { payrollPeriod: { periodStart: "desc" } }, include: { payrollPeriod: { select: { code: true, status: true } } } }),
    prisma.payrollEntry.findFirst({ where: { tenantId, employeeId, current: true, commissionAmount: { not: null }, payrollPeriod: { status: { in: ["CLOSED", "PAID"] } } }, orderBy: { payrollPeriod: { periodStart: "desc" } }, include: { payrollPeriod: { select: { code: true, periodEnd: true } } } }),
  ]);
  return {
    currentPeriod: currentEntry ? { amount: Number(currentEntry.commissionAmount ?? 0), periodCode: currentEntry.payrollPeriod.code, status: currentEntry.payrollPeriod.status as "OPEN" | "REVIEWED" } : null,
    lastPaid: lastPaidEntry ? { amount: Number(lastPaidEntry.commissionAmount), periodCode: lastPaidEntry.payrollPeriod.code, periodEnd: lastPaidEntry.payrollPeriod.periodEnd.toISOString() } : null,
  };
}

export type EconomicGap = { saleId: string; productName: string; planName: string | null; transactionType: string; calculationStatus: string };

// Decision #4 (Final Gate closure, 2026-08-17): with CompensationCommissionRule retired as a commission source,
// "falta una regla aplicable" now means the ECONOMIC engine itself couldn't resolve a sale (PENDING_RULE = no
// EconomicRule matched at all; REQUIRES_REVIEW = matched but ambiguous/incompletely configured) — never a silent
// fallback to 0. Only approved-status sales are checked (only those are ever eligible for commission in the first
// place; a REGISTRADA/RECHAZADA sale with no rule isn't a payroll gap).
export async function findUnresolvedEconomicGaps(tenantId: string, periodStart: Date, periodEnd: Date): Promise<EconomicGap[]> {
  const prisma = getPrisma();
  const sales = await prisma.sale.findMany({
    where: { tenantId, saleDate: { gte: periodStart, lt: periodEnd }, status: { in: [...APPROVED_SALE_STATUSES] }, economicCalculations: { some: { current: true, calculationStatus: { in: ["PENDING_RULE", "REQUIRES_REVIEW"] } } } },
    select: { id: true, productNameSnapshot: true, planNameSnapshot: true, transactionType: true, economicCalculations: { where: { current: true }, select: { calculationStatus: true }, take: 1 } },
  });
  return sales.map((sale) => ({ saleId: sale.id, productName: sale.productNameSnapshot, planName: sale.planNameSnapshot, transactionType: sale.transactionType, calculationStatus: sale.economicCalculations[0]?.calculationStatus ?? "PENDING_RULE" }));
}
