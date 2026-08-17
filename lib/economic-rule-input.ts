import type { Prisma, TransactionType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const transactionTypes = new Set(["PORTABILIDAD","ALTA_NUEVA","PORTABILIDAD_POSTPAGO","ALTA_NUEVA_POSTPAGO","MIGRACION","PREPAGO","RENOVACION","LINEA_FIJA","INTERNET_FIJO","OTRO"]);
const calculationTypes = new Set(["FIXED", "PERCENTAGE"]);

function dateValue(value: unknown, required = false, endOfDay = false) {
  if (!value) { if (required) throw new Response("La vigencia desde es obligatoria", { status: 400 }); return null; }
  const date = new Date(`${String(value).slice(0, 10)}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) throw new Response("Fecha de vigencia inválida", { status: 400 });
  return date;
}

function component(typeValue: unknown, amountValue: unknown, label: string) {
  const type = typeValue ? String(typeValue) : null;
  const emptyAmount = amountValue === "" || amountValue === null || amountValue === undefined;
  if (!type && emptyAmount) return { type: null, value: null };
  if (!type || !calculationTypes.has(type)) throw new Response(`Selecciona el tipo de cálculo para ${label}`, { status: 400 });
  if (emptyAmount) throw new Response(`Ingresa el valor de ${label}`, { status: 400 });
  const value = Number(amountValue);
  if (!Number.isFinite(value) || value < 0) throw new Response(`${label} debe ser un valor no negativo`, { status: 400 });
  return { type: type as "FIXED" | "PERCENTAGE", value };
}

export async function economicRuleData(tenantId: string, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim(), code = String(body.code ?? "").trim().toUpperCase();
  if (!name || !code) throw new Response("Nombre y código son obligatorios", { status: 400 });
  const productId = body.productId ? String(body.productId) : null;
  const commercialPlanId = body.commercialPlanId ? String(body.commercialPlanId) : null;
  const transactionType = body.transactionType ? String(body.transactionType) : null;
  if (transactionType && !transactionTypes.has(transactionType)) throw new Response("Tipo de operación inválido", { status: 400 });
  const prisma = getPrisma();
  const [product, plan] = await Promise.all([
    productId ? prisma.product.findFirst({ where: { id: productId, tenantId } }) : null,
    commercialPlanId ? prisma.commercialPlan.findFirst({ where: { id: commercialPlanId, tenantId } }) : null,
  ]);
  if (productId && !product) throw new Response("Producto de otro tenant", { status: 403 });
  if (commercialPlanId && !plan) throw new Response("Plan de otro tenant", { status: 403 });
  if (product && plan && plan.productId !== product.id) throw new Response("El plan no pertenece al producto seleccionado", { status: 400 });
  const effectiveFrom = dateValue(body.effectiveFrom, true)!;
  const effectiveTo = dateValue(body.effectiveTo, false, true);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Response("La vigencia hasta no puede ser anterior a la vigencia desde", { status: 400 });
  const company = component(body.expectedCompanyIncomeType, body.expectedCompanyIncomeValue, "el ingreso esperado de empresa");
  const promoter = component(body.promoterCommissionType, body.promoterCommissionValue, "la comisión del promotor");
  const supervisor = component(body.supervisorCommissionType, body.supervisorCommissionValue, "la comisión del supervisor");
  return {
    tenantId, name, code, productId, commercialPlanId,
    transactionType: transactionType as TransactionType | null,
    effectiveFrom, effectiveTo, active: body.active === undefined ? true : Boolean(body.active),
    expectedCompanyIncomeType: company.type, expectedCompanyIncomeValue: company.value,
    promoterCommissionType: promoter.type, promoterCommissionValue: promoter.value,
    supervisorCommissionType: supervisor.type, supervisorCommissionValue: supervisor.value,
  } satisfies Prisma.EconomicRuleUncheckedCreateInput;
}

export function requireEconomicReadRole(role: string) {
  if (!['SUPER_ADMIN','COMPANY_ADMIN','SUPERVISOR'].includes(role)) throw new Response("No tienes acceso a configuración económica", { status: 403 });
}

export function requireEconomicWriteRole(role: string) {
  if (!['SUPER_ADMIN','COMPANY_ADMIN'].includes(role)) throw new Response("Solo administración puede gestionar reglas económicas", { status: 403 });
}
