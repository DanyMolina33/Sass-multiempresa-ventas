import { Prisma, type EconomicRule } from "@prisma/client";
import { resolveEconomicRule, calculateSaleEconomics } from "../lib/economic-engine";

const D = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

function rule(partial: Partial<EconomicRule>): EconomicRule {
  return {
    id: partial.id ?? "r", tenantId: "t1", name: partial.name ?? "r", code: partial.code ?? "R",
    productId: null, commercialPlanId: null, transactionType: null,
    effectiveFrom: PAST, effectiveTo: null, active: true,
    expectedCompanyIncomeType: null, expectedCompanyIncomeValue: null,
    promoterCommissionType: null, promoterCommissionValue: null,
    supervisorCommissionType: null, supervisorCommissionValue: null,
    createdAt: PAST, updatedAt: PAST,
    ...partial,
  } as EconomicRule;
}

const sale = {
  id: "s1", tenantId: "t1", productId: "PROD_A", commercialPlanId: "PLAN_A1", transactionType: "ALTA_NUEVA" as const,
  saleDate: new Date("2026-06-15T00:00:00Z"), saleAmount: D(100), fixedChargeSnapshot: null,
  agentId: null, supervisorId: null, historicalAdvisorName: null, historicalSupervisorName: null,
};

const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
function check(name: string, pass: boolean, detail?: unknown) { checks.push({ name, pass, detail }); }

// --- Items 1-5: priority ladder, removing the winner each time and confirming the next exact rung wins ---
const ladder = [
  { id: "productPlanOp", productId: "PROD_A", commercialPlanId: "PLAN_A1", transactionType: "ALTA_NUEVA" as const, expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(80) },
  { id: "productPlan", productId: "PROD_A", commercialPlanId: "PLAN_A1", expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(70) },
  { id: "productOp", productId: "PROD_A", transactionType: "ALTA_NUEVA" as const, expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(60) },
  { id: "planOp", commercialPlanId: "PLAN_A1", transactionType: "ALTA_NUEVA" as const, expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(50) },
  { id: "product", productId: "PROD_A", expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(40) },
  { id: "plan", commercialPlanId: "PLAN_A1", expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(30) },
  { id: "operation", transactionType: "ALTA_NUEVA" as const, expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(20) },
  { id: "general", expectedCompanyIncomeType: "FIXED" as const, expectedCompanyIncomeValue: D(10) },
].map(rule);

let pool = [...ladder];
const expectedOrder = ["productPlanOp", "productPlan", "productOp", "planOp", "product", "plan", "operation", "general"];
for (const expectedWinnerId of expectedOrder) {
  const resolved = resolveEconomicRule(pool, sale);
  check(`priority ladder: winner should be "${expectedWinnerId}" with ${pool.length} rule(s) left`, resolved.rule?.id === expectedWinnerId, resolved.rule?.id);
  pool = pool.filter((r) => r.id !== expectedWinnerId);
}
check("item 9: sin regla → PENDING_RULE when the pool is empty", calculateSaleEconomics(sale, pool).calculationStatus === "PENDING_RULE" && pool.length === 0);

// --- Item 6: vigencia por fecha ---
const futureRule = rule({ id: "future", productId: "PROD_A", effectiveFrom: FUTURE, expectedCompanyIncomeType: "FIXED", expectedCompanyIncomeValue: D(999) });
const expiredRule = rule({ id: "expired", productId: "PROD_A", effectiveFrom: PAST, effectiveTo: new Date("2026-02-01T00:00:00Z"), expectedCompanyIncomeType: "FIXED", expectedCompanyIncomeValue: D(999) });
const validRule = rule({ id: "valid", productId: "PROD_A", effectiveFrom: PAST, effectiveTo: FUTURE, expectedCompanyIncomeType: "FIXED", expectedCompanyIncomeValue: D(15) });
check("vigencia: a rule starting in the future must not match a past sale", resolveEconomicRule([futureRule], sale).rule === null);
check("vigencia: a rule already expired before the sale must not match", resolveEconomicRule([expiredRule], sale).rule === null);
check("vigencia: a rule whose window covers the sale date must match", resolveEconomicRule([validRule], sale).rule?.id === "valid");

// --- Item 7: monto fijo is independent of saleAmount ---
const fixedRule = rule({ id: "fixed", productId: "PROD_A", expectedCompanyIncomeType: "FIXED", expectedCompanyIncomeValue: D(77) });
const fixedResultLowBase = calculateSaleEconomics({ ...sale, saleAmount: D(1) }, [fixedRule]);
const fixedResultHighBase = calculateSaleEconomics({ ...sale, saleAmount: D(999999) }, [fixedRule]);
check("monto fijo: expectedCompanyIncome equals the configured value regardless of saleAmount", fixedResultLowBase.expectedCompanyIncome?.toString() === "77" && fixedResultHighBase.expectedCompanyIncome?.toString() === "77");

// --- Item 8: porcentaje solo si existe base ---
const percentRule = rule({ id: "percent", productId: "PROD_A", expectedCompanyIncomeType: "PERCENTAGE", expectedCompanyIncomeValue: D(10) });
const withBase = calculateSaleEconomics({ ...sale, saleAmount: D(100) }, [percentRule]);
const withoutBase = calculateSaleEconomics({ ...sale, saleAmount: null }, [percentRule]);
check("porcentaje con base real: 10% de 100 = 10, estado CALCULATED", withBase.expectedCompanyIncome?.toString() === "10" && withBase.calculationStatus === "CALCULATED", withBase);
check("porcentaje sin base: no inventa monto, queda REQUIRES_REVIEW", withoutBase.expectedCompanyIncome === null && withoutBase.calculationStatus === "REQUIRES_REVIEW", withoutBase);

// --- Item 10: 0 vs SIN CONFIGURAR, for expectedCompanyIncome and promoterCommission alike ---
const unsetRule = rule({ id: "unset", productId: "PROD_A" });
const explicitZeroRule = rule({ id: "zero", productId: "PROD_A", expectedCompanyIncomeType: "FIXED", expectedCompanyIncomeValue: D(0), promoterCommissionType: "FIXED", promoterCommissionValue: D(0) });
const unsetResult = calculateSaleEconomics(sale, [unsetRule]);
const zeroResult = calculateSaleEconomics(sale, [explicitZeroRule]);
check("SIN CONFIGURAR: expectedCompanyIncome queda null cuando la regla no define nada", unsetResult.expectedCompanyIncome === null, unsetResult.expectedCompanyIncome);
check("0 explícito: expectedCompanyIncome es 0 (no null) cuando se configura así", zeroResult.expectedCompanyIncome !== null && zeroResult.expectedCompanyIncome.toString() === "0", zeroResult.expectedCompanyIncome);
check("0 explícito también distingue promoterCommission de SIN CONFIGURAR", zeroResult.promoterCommission !== null && zeroResult.promoterCommission.toString() === "0", zeroResult.promoterCommission);
check("SIN CONFIGURAR también aplica a promoterCommission", unsetResult.promoterCommission === null);

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed }, null, 2));
if (failed.length) process.exit(1);
