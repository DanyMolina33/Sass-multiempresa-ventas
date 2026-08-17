import { Prisma } from "@prisma/client";
import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelWrite } from "@/lib/payroll-access";
import { findUnresolvedEconomicGaps, recalculatePayrollPeriod } from "@/lib/payroll-engine";

const ACTIONS = ["recalculate", "review", "close", "pay"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const { id } = await params, prisma = getPrisma();
  const period = await prisma.payrollPeriod.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!period) throw new Response("Período fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (!ACTIONS.includes(action as never)) throw new Response("Acción de período inválida", { status: 400 });

  if (action === "recalculate") {
    if (period.status === "CLOSED" || period.status === "PAID") throw new Response("El período ya está cerrado; no admite recálculo", { status: 409 });
    await recalculatePayrollPeriod(context.tenantId, id);
    return Response.json({ item: await prisma.payrollPeriod.findUniqueOrThrow({ where: { id } }) });
  }
  if (action === "review") {
    if (period.status !== "OPEN") throw new Response("Solo un período abierto puede marcarse como revisado", { status: 409 });
    const item = await prisma.payrollPeriod.update({ where: { id }, data: { status: "REVIEWED", reviewedAt: new Date() } });
    return Response.json({ item });
  }
  if (action === "close") {
    if (period.status === "CLOSED" || period.status === "PAID") throw new Response("El período ya está cerrado", { status: 409 });
    // Decision #4: never close a period silently when the economic engine couldn't resolve a real commission for
    // an approved sale in range — no invented percentage, no silent monetary fallback to 0.
    const gaps = await findUnresolvedEconomicGaps(context.tenantId, period.periodStart, period.periodEnd);
    if (gaps.length) throw new Response(`No se puede cerrar: ${gaps.length} venta(s) aprobada(s) del período no tienen una regla económica resuelta (${gaps.slice(0, 5).map((g) => `${g.productName}${g.planName ? ` / ${g.planName}` : ""} (${g.transactionType}): ${g.calculationStatus}`).join("; ")}${gaps.length > 5 ? "…" : ""}). Configura o corrige la regla correspondiente antes de cerrar.`, { status: 409 });
    const item = await prisma.payrollPeriod.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    return Response.json({ item });
  }
  // pay — the period.status !== "CLOSED" guard above already makes this idempotent: once PAID, status is no
  // longer CLOSED, so a second call is rejected here before anything is created (no reliance on a separate flag).
  if (period.status !== "CLOSED") throw new Response("Solo un período cerrado puede pagarse", { status: 409 });
  const entries = await prisma.payrollEntry.findMany({ where: { tenantId: context.tenantId, payrollPeriodId: id, current: true } });
  const totalCompanyCost = entries.reduce((total, entry) => total.add(entry.totalCompanyCost), new Prisma.Decimal(0));
  const category = await prisma.financeCategory.upsert({ where: { tenantId_type_name: { tenantId: context.tenantId, type: "GASTO", name: "Planilla y personal" } }, update: {}, create: { tenantId: context.tenantId, type: "GASTO", name: "Planilla y personal" } });
  await prisma.$transaction(async (tx) => {
    await tx.financeEntry.create({ data: { tenantId: context.tenantId, type: "GASTO", categoryId: category.id, entryDate: new Date(), concept: `Pago de personal — periodo ${period.code}`, amount: totalCompanyCost, currency: "PEN", registeredByUserId: context.userId, payrollPeriodId: id } });
    await tx.payrollPeriod.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  });
  const item = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id }, include: { financeEntry: true } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
