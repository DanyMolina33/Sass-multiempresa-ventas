import { Prisma } from "@prisma/client";
import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireFinanceRead, requireFinanceWrite } from "@/lib/finance-access";

const TYPES = ["INGRESO", "GASTO"] as const;
const OPERATING_CURRENCY = "PEN";
// "Reconocidas" mirrors the exact status set the Liquidaciones KPI already calls reconocidas (see reconciliation route) — not every result status, so this doesn't invent a new business rule.
const RECOGNIZED_STATUSES = ["CONFORME", "DIFERENCIA", "PENDIENTE"] as const;

function dateRangeFrom(period: string | undefined, day: string | undefined) {
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

export async function GET(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceRead(context.role);
  const search = new URL(request.url).searchParams;
  const period = search.get("period") || undefined, day = search.get("day") || undefined, type = search.get("type") || undefined, categoryId = search.get("categoryId") || undefined, term = search.get("search") || undefined;
  const range = dateRangeFrom(period, day);
  const prisma = getPrisma();

  // KPI totals only ever respect the period/day filter — not type, category or search, so "Resultado base" always
  // reflects the whole period regardless of which slice of the table the user happens to be looking at.
  const summaryWhere: Prisma.FinanceEntryWhereInput = { tenantId: context.tenantId, ...(range ? { entryDate: range } : {}) };
  const listWhere: Prisma.FinanceEntryWhereInput = { ...summaryWhere, ...(type ? { type: type as never } : {}), ...(categoryId ? { categoryId } : {}), ...(term ? { OR: [{ concept: { contains: term, mode: "insensitive" } }, { notes: { contains: term, mode: "insensitive" } }, { documentReference: { contains: term, mode: "insensitive" } }] } : {}) };
  // Ingresos reconocidos read directly from ReconciliationResult — Liquidaciones stays the sole source of truth and nothing gets copied into FinanceEntry.
  const recognizedWhere: Prisma.ReconciliationResultWhereInput = { tenantId: context.tenantId, status: { in: [...RECOGNIZED_STATUSES] }, ...(range ? { reconciliation: { settlementDate: range } } : {}) };

  const [items, otherIncomeSum, expenseSum, nonOperatingCurrencyGroups, recognizedSum] = await Promise.all([
    prisma.financeEntry.findMany({ where: listWhere, include: { category: { select: { id: true, name: true } }, registeredBy: { select: { id: true, name: true } } }, orderBy: { entryDate: "desc" }, take: 200 }),
    prisma.financeEntry.aggregate({ where: { ...summaryWhere, type: "INGRESO", currency: OPERATING_CURRENCY }, _sum: { amount: true } }),
    prisma.financeEntry.aggregate({ where: { ...summaryWhere, type: "GASTO", currency: OPERATING_CURRENCY }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["currency", "type"], where: { ...summaryWhere, currency: { not: OPERATING_CURRENCY } }, _count: { _all: true } }),
    prisma.reconciliationResult.aggregate({ where: recognizedWhere, _sum: { recognizedAmount: true } }),
  ]);

  const recognizedIncome = Number(recognizedSum._sum.recognizedAmount ?? 0);
  const otherIncome = Number(otherIncomeSum._sum.amount ?? 0);
  const expenses = Number(expenseSum._sum.amount ?? 0);
  const totalIncome = recognizedIncome + otherIncome;
  const baseResult = totalIncome - expenses;
  const excludedOtherCurrency = nonOperatingCurrencyGroups.map((row) => ({ currency: row.currency, type: row.type, count: row._count._all }));

  return Response.json({ items, summary: { operatingCurrency: OPERATING_CURRENCY, recognizedIncome, otherIncome, expenses, totalIncome, baseResult, excludedOtherCurrency } });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const type = String(body.type ?? ""), categoryId = String(body.categoryId ?? ""), concept = String(body.concept ?? "").trim();
  const entryDate = String(body.entryDate ?? ""), amountValue = Number(body.amount), currency = String(body.currency ?? "PEN").trim().toUpperCase() || "PEN";
  const notes = String(body.notes ?? "").trim() || null, documentName = String(body.documentName ?? "").trim() || null, documentReference = String(body.documentReference ?? "").trim() || null;
  if (!TYPES.includes(type as never)) throw new Response("Selecciona si el movimiento es ingreso o gasto", { status: 400 });
  if (!concept) throw new Response("El concepto es obligatorio", { status: 400 });
  if (!entryDate || Number.isNaN(Date.parse(entryDate))) throw new Response("La fecha del movimiento es obligatoria", { status: 400 });
  if (!Number.isFinite(amountValue) || amountValue <= 0) throw new Response("El monto debe ser un número mayor a cero", { status: 400 });
  const category = await getPrisma().financeCategory.findFirst({ where: { id: categoryId, tenantId: context.tenantId } });
  if (!category) throw new Response("Categoría fuera del tenant", { status: 403 });
  if (category.type !== type) throw new Response("La categoría seleccionada no corresponde al tipo de movimiento", { status: 400 });
  const item = await getPrisma().financeEntry.create({ data: { tenantId: context.tenantId, type: type as never, categoryId, entryDate: new Date(`${entryDate}T00:00:00Z`), concept, amount: amountValue, currency, notes, documentName, documentReference, registeredByUserId: context.userId }, include: { category: { select: { id: true, name: true } }, registeredBy: { select: { id: true, name: true } } } });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
