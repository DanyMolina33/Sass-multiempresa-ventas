import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type DateRange = { gte: Date; lt: Date };

export function resolveDateRange(period?: string, day?: string): DateRange | null {
  if (day) {
    if (Number.isNaN(Date.parse(day))) return null;
    const start = new Date(`${day}T00:00:00Z`);
    const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }
  if (period) {
    const [year, month] = period.split("-").map(Number);
    if (!year || !month) return null;
    return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
  }
  return null;
}

// Same set the Liquidaciones and Finanzas phases already established as "reconocidas" — kept identical here so this
// consolidation layer never disagrees with the modules it summarizes.
const RECOGNIZED_STATUSES = ["CONFORME", "DIFERENCIA"] as const;

export type SalesFilter = { productId?: string; commercialPlanId?: string; transactionType?: string; agentId?: string; supervisorId?: string; storeId?: string };

// Single canonical definition of "aprobada" for the whole app (goals, ranking, dashboard, payroll eligibility).
// Previously duplicated as an independent literal in lib/payroll-engine.ts — now imported from here instead, so a
// future change to this business rule can't silently drift between the two.
export const APPROVED_SALE_STATUSES = ["APROBADA", "ACTIVADA"] as const;

export async function getSalesMetrics(tenantId: string, range: DateRange | null, filters: SalesFilter = {}) {
  const prisma = getPrisma();
  const where: Prisma.SaleWhereInput = { tenantId, ...(range ? { saleDate: range } : {}), ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.commercialPlanId ? { commercialPlanId: filters.commercialPlanId } : {}), ...(filters.transactionType ? { transactionType: filters.transactionType as never } : {}), ...(filters.agentId ? { agentId: filters.agentId } : {}), ...(filters.supervisorId ? { supervisorId: filters.supervisorId } : {}), ...(filters.storeId ? { storeId: filters.storeId } : {}) };
  const [total, byStatus] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const aprobadas = (counts.APROBADA ?? 0) + (counts.ACTIVADA ?? 0);
  const rechazadas = counts.RECHAZADA ?? 0;
  const canceladas = counts.CANCELADA ?? 0;
  // "Procesadas" = sales that already reached a final state — still-pending ones are deliberately excluded from the
  // denominator so the rate isn't artificially depressed while a batch is mid-pipeline.
  const procesadas = aprobadas + rechazadas + canceladas;
  return {
    total, aprobadas, rechazadas, canceladas,
    pendientes: (counts.REGISTRADA ?? 0) + (counts.EN_VALIDACION ?? 0),
    tasaAprobacion: procesadas ? Math.round((aprobadas / procesadas) * 1000) / 10 : 0,
    byStatus: counts,
  };
}

export async function getCustomerMetrics(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  // "Nuevos" necessarily uses createdAt: unlike Sale (which has an explicit saleDate business date), a Customer
  // record has no separate acquisition-date field — its createdAt IS the real business event (when it entered the CRM).
  const [total, nuevosEnPeriodo] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    range ? prisma.customer.count({ where: { tenantId, createdAt: range } }) : Promise.resolve(null),
  ]);
  return { total, nuevosEnPeriodo };
}

// Final Gate closure (2026-08-17), decision #2: Settlement/SettlementDetail is a real, pre-existing historical
// liquidación ledger, produced outside this app's live Reconciliation workflow (see FINAL_GATE_AUDIT.md — proven
// empirically that SettlementDetail.comisionEsperada/comisionClaro are the exact same economic quantity as
// SaleEconomicCalculation.expectedCompanyIncome / ReconciliationResult.recognizedAmount, just tracked through an
// older pipeline). A sale's recognized income is counted from AT MOST ONE source, ever: a live ReconciliationResult
// (if one exists for that sale) always wins over the historical Settlement snapshot — this is what makes it safe
// for the live upload workflow to eventually re-process any of these same sales without double counting. Nothing
// here writes to Settlement/SettlementDetail or ReconciliationResult; it is a pure, additive read-side merge.
async function getSettlementLedgerContribution(tenantId: string, range: DateRange | null, excludeSaleIds: Set<string>) {
  const prisma = getPrisma();
  const settlements = range ? await prisma.settlement.findMany({ where: { tenantId, settlementDate: range }, select: { id: true } }) : await prisma.settlement.findMany({ where: { tenantId }, select: { id: true } });
  if (!settlements.length) return { count: 0, expected: new Prisma.Decimal(0), recognized: new Prisma.Decimal(0), difference: new Prisma.Decimal(0) };
  const details = await prisma.settlementDetail.findMany({
    where: { tenantId, settlementId: { in: settlements.map((s) => s.id) }, estado: "RECONOCIDA", saleId: { not: null } },
  });
  const eligible = details.filter((d) => d.saleId && !excludeSaleIds.has(d.saleId));
  const expected = eligible.reduce((total, d) => d.comisionEsperada ? total.add(d.comisionEsperada) : total, new Prisma.Decimal(0));
  const recognized = eligible.reduce((total, d) => d.comisionClaro ? total.add(d.comisionClaro) : total, new Prisma.Decimal(0));
  return { count: eligible.length, expected, recognized, difference: recognized.sub(expected) };
}

export async function getLiquidacionesMetrics(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const where: Prisma.ReconciliationResultWhereInput = { tenantId, ...(range ? { reconciliation: { settlementDate: range } } : {}) };
  const [counts, sums, liveSaleIds] = await Promise.all([
    prisma.reconciliationResult.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.reconciliationResult.aggregate({ where, _sum: { expectedAmount: true, recognizedAmount: true, differenceAmount: true } }),
    // Only a MEANINGFULLY recognized live result (CONFORME/DIFERENCIA) supersedes the historical ledger for a sale
    // — a NO_LIQUIDADO/PENDIENTE/REQUIERE_REVISION result (e.g. a synthetic "not found" row created as a side
    // effect of importing an unrelated file for the same period) must never erase a real historical recognition
    // that already exists in Settlement. Confirmed live 2026-08-17: without this filter, uploading an unrelated
    // 1-row file for period 2026-05 silently zeroed out ~29 other real, already-recognized sales.
    prisma.reconciliationResult.findMany({ where: { tenantId, saleId: { not: null }, status: { in: [...RECOGNIZED_STATUSES] } }, select: { saleId: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const ledger = await getSettlementLedgerContribution(tenantId, range, new Set(liveSaleIds.map((r) => r.saleId!)));
  return {
    reconocidas: (byStatus.CONFORME ?? 0) + (byStatus.DIFERENCIA ?? 0) + ledger.count,
    conformes: (byStatus.CONFORME ?? 0) + ledger.count,
    conDiferencia: byStatus.DIFERENCIA ?? 0,
    noLiquidadas: byStatus.NO_LIQUIDADO ?? 0,
    pendientes: byStatus.PENDIENTE ?? 0,
    enRevision: byStatus.REQUIERE_REVISION ?? 0,
    ingresoEsperado: Number(sums._sum.expectedAmount ?? 0) + Number(ledger.expected),
    ingresoReconocido: Number(sums._sum.recognizedAmount ?? 0) + Number(ledger.recognized),
    diferenciaTotal: Number(sums._sum.differenceAmount ?? 0) + Number(ledger.difference),
  };
}

export async function getFinanceConsolidation(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const recognizedWhere: Prisma.ReconciliationResultWhereInput = { tenantId, status: { in: [...RECOGNIZED_STATUSES] }, ...(range ? { reconciliation: { settlementDate: range } } : {}) };
  const financeBaseWhere: Prisma.FinanceEntryWhereInput = { tenantId, ...(range ? { entryDate: range } : {}) };
  const [recognizedSum, otherIncomeSum, operatingExpenseSum, personnelCostRealSum, expectedIncomeAgg, liveSaleIds] = await Promise.all([
    prisma.reconciliationResult.aggregate({ where: recognizedWhere, _sum: { recognizedAmount: true } }),
    prisma.financeEntry.aggregate({ where: { ...financeBaseWhere, type: "INGRESO" }, _sum: { amount: true } }),
    // Operating vs personnel expenses are partitioned by payrollPeriodId — set only on the one consolidated entry
    // Pago de Personal creates when a period is PAID — so this split can never double count or miss anything.
    prisma.financeEntry.aggregate({ where: { ...financeBaseWhere, type: "GASTO", payrollPeriodId: null }, _sum: { amount: true } }),
    // Personnel cost is deliberately NOT filtered by the FinanceEntry's own entryDate (that's just the cash/payment
    // date, e.g. salaries for March often get paid in April) — it's attributed to a period via the originating
    // PayrollPeriod's own periodStart/periodEnd, the real business date for "cost incurred for work done then".
    prisma.financeEntry.aggregate({ where: { tenantId, type: "GASTO", payrollPeriodId: { not: null }, ...(range ? { payrollPeriod: { periodStart: { lt: range.lt }, periodEnd: { gte: range.gte } } } : {}) }, _sum: { amount: true } }),
    prisma.saleEconomicCalculation.aggregate({ where: { tenantId, current: true, ...(range ? { sale: { saleDate: range } } : {}) }, _sum: { expectedCompanyIncome: true } }),
    // Only a MEANINGFULLY recognized live result supersedes the historical ledger — see the identical note in
    // getLiquidacionesMetrics above (same real bug, same fix, kept in sync deliberately).
    prisma.reconciliationResult.findMany({ where: { tenantId, saleId: { not: null }, status: { in: [...RECOGNIZED_STATUSES] } }, select: { saleId: true } }),
  ]);
  const settlementLedger = await getSettlementLedgerContribution(tenantId, range, new Set(liveSaleIds.map((r) => r.saleId!)));
  const recognizedIncome = Number(recognizedSum._sum.recognizedAmount ?? 0) + Number(settlementLedger.recognized);
  const otherIncome = Number(otherIncomeSum._sum.amount ?? 0);
  const operatingExpenses = Number(operatingExpenseSum._sum.amount ?? 0);
  const personnelCostReal = Number(personnelCostRealSum._sum.amount ?? 0);
  const totalIncome = recognizedIncome + otherIncome;
  const totalCosts = operatingExpenses + personnelCostReal;

  const projectedPersonnelWhere: Prisma.PayrollEntryWhereInput = { tenantId, current: true, payrollPeriod: { status: { in: ["OPEN", "REVIEWED"] }, ...(range ? { periodStart: { lt: range.lt }, periodEnd: { gte: range.gte } } : {}) } };
  const projectedPersonnelAgg = await prisma.payrollEntry.aggregate({ where: projectedPersonnelWhere, _sum: { totalCompanyCost: true, commissionAmount: true } });

  const expectedIncome = Number(expectedIncomeAgg._sum.expectedCompanyIncome ?? 0);
  const projectedPersonnelCost = Number(projectedPersonnelAgg._sum.totalCompanyCost ?? 0);
  // Proyección swaps only the two pieces that actually have a forward-looking counterpart (expected income instead
  // of recognized, and OPEN/REVIEWED personnel cost instead of PAID); otherIncome/operatingExpenses have no separate
  // projected mechanism in this phase, so both modes reuse the same real, already-registered FinanceEntry figures.
  const economicResultProjected = (expectedIncome + otherIncome) - (operatingExpenses + projectedPersonnelCost);
  // "Still pending settlement" = of what was expected, how much has no valid recognition yet. Floored at 0 — if a
  // provider recognizes MORE than expected, that surplus is a positive "diferencia de liquidación", not negative pending.
  const pendingSettlement = Math.max(0, expectedIncome - recognizedIncome);

  return {
    real: { recognizedIncome, otherIncome, operatingExpenses, personnelCostReal, totalIncome, totalCosts, economicResult: totalIncome - totalCosts, pendingSettlement },
    projection: {
      expectedIncome,
      projectedCommissions: Number(projectedPersonnelAgg._sum.commissionAmount ?? 0),
      projectedPersonnelCost,
      economicResultProjected,
    },
  };
}

export async function getPersonnelMetrics(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const where: Prisma.PayrollEntryWhereInput = { tenantId, current: true, ...(range ? { payrollPeriod: { periodStart: { lt: range.lt }, periodEnd: { gte: range.gte } } } : {}) };
  const entries = await prisma.payrollEntry.findMany({ where, select: { baseSalary: true, commissionAmount: true, bonusAmount: true, mobilityAmount: true, otherIncomeAmount: true, employerContributionsAmount: true, netAmount: true, totalCompanyCost: true } });
  const sum = (key: keyof typeof entries[number]) => entries.reduce((total, entry) => { const value = entry[key]; return value !== null ? total + Number(value) : total; }, 0);
  return {
    activeEmployees: await prisma.employee.count({ where: { tenantId, status: "ACTIVE" } }),
    baseSalaries: sum("baseSalary"), commissions: sum("commissionAmount"), bonusesAndMobility: sum("bonusAmount") + sum("mobilityAmount"),
    otherIncome: sum("otherIncomeAmount"), employerContributions: sum("employerContributionsAmount"), netToPay: sum("netAmount"), totalCompanyCost: sum("totalCompanyCost"),
  };
}

export async function getBusinessSummary(tenantId: string, params: { period?: string; day?: string } & SalesFilter) {
  const range = resolveDateRange(params.period, params.day);
  const [sales, customers, liquidaciones, finance, personnel] = await Promise.all([
    getSalesMetrics(tenantId, range, params),
    getCustomerMetrics(tenantId, range),
    getLiquidacionesMetrics(tenantId, range),
    getFinanceConsolidation(tenantId, range),
    getPersonnelMetrics(tenantId, range),
  ]);
  return { range: range ? { from: range.gte.toISOString(), to: range.lt.toISOString() } : null, sales, customers, liquidaciones, finance, personnel };
}

// ---------------------------------------------------------------------------
// Dashboard Ejecutivo — additive on top of the functions above; no formula here
// duplicates one already defined earlier in this same file.
// ---------------------------------------------------------------------------

export type ExecutivePreset = "today" | "this_month" | "last_month" | "last_30_days" | "custom";

export function resolveExecutiveRange(preset: ExecutivePreset, from?: string, to?: string): DateRange {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }
  if (preset === "this_month") return { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
  if (preset === "last_month") return { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
  if (preset === "last_30_days") {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(end.getTime()); start.setUTCDate(start.getUTCDate() - 30);
    return { gte: start, lt: end };
  }
  // custom
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(`${from}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let end: Date;
  if (to && !Number.isNaN(Date.parse(to))) { end = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1); } else end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { gte: start, lt: end };
}

function todayRange(): DateRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

// Deliberately bucketed by the SALE's own saleDate for all three series (including recognizedAmount) — this chart
// compares "of what was sold on day X, how much was expected vs. eventually recognized", which needs one shared time
// axis. The period-level financial consolidation above correctly uses settlementDate for its own real/proyección
// split instead — that's a different question ("cash recognized during period Y"), so it's not reused here.
export async function getSalesTimeSeries(tenantId: string, range: DateRange) {
  const prisma = getPrisma();
  const days = (range.lt.getTime() - range.gte.getTime()) / 86400000;
  const bucketUnit = days <= 45 ? "day" : "month";
  const [salesRows, recognizedRows] = await Promise.all([
    prisma.$queryRaw<Array<{ bucket: Date; sales_count: bigint; expected: string | null }>>`
      SELECT date_trunc(${bucketUnit}, s."saleDate") AS bucket, count(*)::int AS sales_count, SUM(sec."expectedCompanyIncome") AS expected
      FROM "Sale" s LEFT JOIN "SaleEconomicCalculation" sec ON sec."saleId" = s.id AND sec.current = true
      WHERE s."tenantId" = ${tenantId} AND s."saleDate" >= ${range.gte} AND s."saleDate" < ${range.lt}
      GROUP BY bucket ORDER BY bucket`,
    prisma.$queryRaw<Array<{ bucket: Date; recognized: string | null }>>`
      SELECT date_trunc(${bucketUnit}, s."saleDate") AS bucket, SUM(rr."recognizedAmount") AS recognized
      FROM "Sale" s JOIN "ReconciliationResult" rr ON rr."saleId" = s.id AND rr.status IN ('CONFORME','DIFERENCIA')
      WHERE s."tenantId" = ${tenantId} AND s."saleDate" >= ${range.gte} AND s."saleDate" < ${range.lt}
      GROUP BY bucket ORDER BY bucket`,
  ]);
  const recognizedByBucket = new Map(recognizedRows.map((row) => [row.bucket.toISOString(), Number(row.recognized ?? 0)]));
  return { bucketUnit, points: salesRows.map((row) => ({ bucket: row.bucket.toISOString(), sales: Number(row.sales_count), expected: Number(row.expected ?? 0), recognized: recognizedByBucket.get(row.bucket.toISOString()) ?? 0 })) };
}

export async function getProductDistribution(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const where: Prisma.SaleWhereInput = { tenantId, ...(range ? { saleDate: range } : {}) };
  const [rows, total] = await Promise.all([
    prisma.sale.groupBy({ by: ["productId"], where, _count: { _all: true }, orderBy: { _count: { productId: "desc" } } }),
    prisma.sale.count({ where }),
  ]);
  const products = await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } });
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return rows.map((row) => ({ productId: row.productId, name: nameById.get(row.productId) ?? "—", count: row._count._all, percentage: total ? Math.round((row._count._all / total) * 1000) / 10 : 0 }));
}

export async function getTopCommercialPlans(tenantId: string, range: DateRange | null, limit = 10) {
  const prisma = getPrisma();
  const where: Prisma.SaleWhereInput = { tenantId, commercialPlanId: { not: null }, ...(range ? { saleDate: range } : {}) };
  const rows = await prisma.sale.groupBy({ by: ["commercialPlanId"], where, _count: { _all: true }, orderBy: { _count: { commercialPlanId: "desc" } }, take: limit });
  const planIds = rows.map((r) => r.commercialPlanId).filter((id): id is string => Boolean(id));
  if (!planIds.length) return [];
  const [plans, expectedRows, recognizedRows] = await Promise.all([
    prisma.commercialPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }),
    prisma.$queryRaw<Array<{ commercialPlanId: string; expected: string | null }>>`
      SELECT s."commercialPlanId", SUM(sec."expectedCompanyIncome") AS expected
      FROM "Sale" s JOIN "SaleEconomicCalculation" sec ON sec."saleId" = s.id AND sec.current = true
      WHERE s."tenantId" = ${tenantId} AND s."commercialPlanId" = ANY(${planIds}) ${range ? Prisma.sql`AND s."saleDate" >= ${range.gte} AND s."saleDate" < ${range.lt}` : Prisma.empty}
      GROUP BY s."commercialPlanId"`,
    prisma.$queryRaw<Array<{ commercialPlanId: string; recognized: string | null }>>`
      SELECT s."commercialPlanId", SUM(rr."recognizedAmount") AS recognized
      FROM "Sale" s JOIN "ReconciliationResult" rr ON rr."saleId" = s.id AND rr.status IN ('CONFORME','DIFERENCIA')
      WHERE s."tenantId" = ${tenantId} AND s."commercialPlanId" = ANY(${planIds}) ${range ? Prisma.sql`AND s."saleDate" >= ${range.gte} AND s."saleDate" < ${range.lt}` : Prisma.empty}
      GROUP BY s."commercialPlanId"`,
  ]);
  const nameById = new Map(plans.map((p) => [p.id, p.name]));
  const expectedById = new Map(expectedRows.map((r) => [r.commercialPlanId, Number(r.expected ?? 0)]));
  const recognizedById = new Map(recognizedRows.map((r) => [r.commercialPlanId, Number(r.recognized ?? 0)]));
  return rows.map((row) => ({ commercialPlanId: row.commercialPlanId!, name: nameById.get(row.commercialPlanId!) ?? "—", count: row._count._all, expectedIncome: expectedById.get(row.commercialPlanId!) ?? 0, recognizedIncome: recognizedById.get(row.commercialPlanId!) ?? 0 }));
}

export async function getOperationDistribution(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const where: Prisma.SaleWhereInput = { tenantId, ...(range ? { saleDate: range } : {}) };
  const [rows, total] = await Promise.all([
    prisma.sale.groupBy({ by: ["transactionType"], where, _count: { _all: true }, orderBy: { _count: { transactionType: "desc" } } }),
    prisma.sale.count({ where }),
  ]);
  return rows.map((row) => ({ transactionType: row.transactionType, count: row._count._all, percentage: total ? Math.round((row._count._all / total) * 1000) / 10 : 0 }));
}

// Real promoters (agentId set, a genuine User/Employee) and historical advisors (imported sales, text-only,
// agentId null) are kept as two separate lists — never merged by matching names, since a shared name proves nothing.
export async function getPromoterRanking(tenantId: string, range: DateRange | null, limit = 10) {
  const prisma = getPrisma();
  const realWhere: Prisma.SaleWhereInput = { tenantId, agentId: { not: null }, ...(range ? { saleDate: range } : {}) };
  const [totalRows, approvedRows] = await Promise.all([
    prisma.sale.groupBy({ by: ["agentId"], where: realWhere, _count: { _all: true }, orderBy: { _count: { agentId: "desc" } }, take: limit }),
    prisma.sale.groupBy({ by: ["agentId"], where: { ...realWhere, status: { in: ["APROBADA", "ACTIVADA"] } }, _count: { _all: true } }),
  ]);
  const agentIds = totalRows.map((r) => r.agentId).filter((id): id is string => Boolean(id));
  const [users, employees] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { tenantId, userId: { in: agentIds } }, select: { id: true, userId: true } }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const approvedById = new Map(approvedRows.map((r) => [r.agentId, r._count._all]));
  const employeeByUserId = new Map(employees.map((e) => [e.userId, e.id]));
  const employeeIds = agentIds.map((id) => employeeByUserId.get(id)).filter((id): id is string => Boolean(id));
  const commissionRows = employeeIds.length && range ? await prisma.payrollEntry.groupBy({ by: ["employeeId"], where: { tenantId, current: true, employeeId: { in: employeeIds }, payrollPeriod: { periodStart: { lt: range.lt }, periodEnd: { gte: range.gte } } }, _sum: { commissionAmount: true } }) : [];
  const commissionByEmployeeId = new Map(commissionRows.map((r) => [r.employeeId, Number(r._sum.commissionAmount ?? 0)]));
  const real = totalRows.map((row) => {
    const approved = approvedById.get(row.agentId) ?? 0;
    const employeeId = employeeByUserId.get(row.agentId!);
    return { agentId: row.agentId!, name: nameById.get(row.agentId!) ?? "—", sales: row._count._all, approved, approvalRate: row._count._all ? Math.round((approved / row._count._all) * 1000) / 10 : 0, commission: employeeId ? commissionByEmployeeId.get(employeeId) ?? null : null };
  });

  const historicalWhere: Prisma.SaleWhereInput = { tenantId, agentId: null, historicalAdvisorName: { not: null }, ...(range ? { saleDate: range } : {}) };
  const [historicalTotal, historicalApproved] = await Promise.all([
    prisma.sale.groupBy({ by: ["historicalAdvisorName"], where: historicalWhere, _count: { _all: true }, orderBy: { _count: { historicalAdvisorName: "desc" } }, take: limit }),
    prisma.sale.groupBy({ by: ["historicalAdvisorName"], where: { ...historicalWhere, status: { in: ["APROBADA", "ACTIVADA"] } }, _count: { _all: true } }),
  ]);
  const historicalApprovedByName = new Map(historicalApproved.map((r) => [r.historicalAdvisorName, r._count._all]));
  const historical = historicalTotal.map((row) => { const approved = historicalApprovedByName.get(row.historicalAdvisorName) ?? 0; return { historicalAdvisorName: row.historicalAdvisorName!, sales: row._count._all, approved, approvalRate: row._count._all ? Math.round((approved / row._count._all) * 1000) / 10 : 0 }; });

  return { real, historical };
}

export async function getStoreRanking(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const anyStoreSale = await prisma.sale.count({ where: { tenantId, storeId: { not: null } } });
  if (!anyStoreSale) return null; // no fabricar "tiendas" cuando el tenant nunca asoció ninguna venta a una
  const where: Prisma.SaleWhereInput = { tenantId, storeId: { not: null }, ...(range ? { saleDate: range } : {}) };
  const [totalRows, approvedRows, unassigned] = await Promise.all([
    prisma.sale.groupBy({ by: ["storeId"], where, _count: { _all: true }, orderBy: { _count: { storeId: "desc" } } }),
    prisma.sale.groupBy({ by: ["storeId"], where: { ...where, status: { in: ["APROBADA", "ACTIVADA"] } }, _count: { _all: true } }),
    prisma.sale.count({ where: { tenantId, storeId: null, ...(range ? { saleDate: range } : {}) } }),
  ]);
  const storeIds = totalRows.map((r) => r.storeId).filter((id): id is string => Boolean(id));
  const [stores, promoterCounts] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }),
    prisma.sale.groupBy({ by: ["storeId", "agentId"], where: { ...where, agentId: { not: null } }, _count: { _all: true } }),
  ]);
  const nameById = new Map(stores.map((s) => [s.id, s.name]));
  const approvedById = new Map(approvedRows.map((r) => [r.storeId, r._count._all]));
  const promotersByStore = new Map<string, number>();
  for (const row of promoterCounts) promotersByStore.set(row.storeId!, (promotersByStore.get(row.storeId!) ?? 0) + 1);
  const total = totalRows.reduce((sum, row) => sum + row._count._all, 0);
  return { stores: totalRows.map((row) => ({ storeId: row.storeId!, name: nameById.get(row.storeId!) ?? "—", sales: row._count._all, approved: approvedById.get(row.storeId!) ?? 0, promoters: promotersByStore.get(row.storeId!) ?? 0, participation: total ? Math.round((row._count._all / total) * 1000) / 10 : 0 })), unassigned };
}

export async function getEconomicAlerts(tenantId: string, range: DateRange | null) {
  const prisma = getPrisma();
  const [liquidaciones, noRuleCount] = await Promise.all([
    getLiquidacionesMetrics(tenantId, range),
    prisma.saleEconomicCalculation.count({ where: { tenantId, current: true, calculationStatus: "PENDING_RULE", ...(range ? { sale: { saleDate: range } } : {}) } }),
  ]);
  return {
    conDiferencia: liquidaciones.conDiferencia,
    noLiquidadas: liquidaciones.noLiquidadas,
    sinRegla: noRuleCount,
    enRevision: liquidaciones.enRevision,
    hasAlerts: liquidaciones.conDiferencia > 0 || liquidaciones.noLiquidadas > 0 || noRuleCount > 0 || liquidaciones.enRevision > 0,
  };
}

export async function getTodayActivity(tenantId: string) {
  const range = todayRange();
  const [sales, promoters, stores] = await Promise.all([
    getSalesMetrics(tenantId, range),
    getPromoterRanking(tenantId, range, 1),
    getStoreRanking(tenantId, range),
  ]);
  const expectedAgg = await getPrisma().saleEconomicCalculation.aggregate({ where: { tenantId, current: true, sale: { saleDate: range } }, _sum: { expectedCompanyIncome: true } });
  return {
    ventasHoy: sales.total, aprobadasHoy: sales.aprobadas, pendientesHoy: sales.pendientes,
    ingresoEsperadoHoy: Number(expectedAgg._sum.expectedCompanyIncome ?? 0),
    topPromotorHoy: promoters.real[0] ?? null,
    topTiendaHoy: stores?.stores[0] ?? null,
  };
}

export async function getExecutiveDashboard(tenantId: string, params: { preset: ExecutivePreset; from?: string; to?: string } & SalesFilter) {
  const range = resolveExecutiveRange(params.preset, params.from, params.to);
  const [sales, customers, liquidaciones, finance, personnel, series, products, plans, operations, promoters, stores, alerts, today] = await Promise.all([
    getSalesMetrics(tenantId, range, params),
    getCustomerMetrics(tenantId, range),
    getLiquidacionesMetrics(tenantId, range),
    getFinanceConsolidation(tenantId, range),
    getPersonnelMetrics(tenantId, range),
    getSalesTimeSeries(tenantId, range),
    getProductDistribution(tenantId, range),
    getTopCommercialPlans(tenantId, range),
    getOperationDistribution(tenantId, range),
    getPromoterRanking(tenantId, range),
    getStoreRanking(tenantId, range),
    getEconomicAlerts(tenantId, range),
    getTodayActivity(tenantId),
  ]);
  return { range: { from: range.gte.toISOString(), to: range.lt.toISOString() }, sales, customers, liquidaciones, finance, personnel, series, products, plans, operations, promoters, stores, alerts, today };
}
