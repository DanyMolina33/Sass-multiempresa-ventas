import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";
import { recalculatePayrollPeriod } from "@/lib/payroll-engine";

export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const items = await getPrisma().payrollPeriod.findMany({ where: { tenantId: context.tenantId }, orderBy: { periodStart: "desc" } });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  if (!body.periodStart || !body.periodEnd) throw new Response("Indica el inicio y fin del período", { status: 400 });
  const periodStart = new Date(`${String(body.periodStart).slice(0, 10)}T00:00:00Z`);
  const periodEnd = new Date(`${String(body.periodEnd).slice(0, 10)}T23:59:59.999Z`);
  if (periodEnd < periodStart) throw new Response("El fin del período no puede ser anterior a su inicio", { status: 400 });
  const code = String(body.code ?? "").trim() || periodStart.toISOString().slice(0, 7);
  const existing = await getPrisma().payrollPeriod.findFirst({ where: { tenantId: context.tenantId, code } });
  if (existing) throw new Response("Ya existe un período con ese código", { status: 409 });
  const period = await getPrisma().payrollPeriod.create({ data: { tenantId: context.tenantId, code, periodStart, periodEnd } });
  await recalculatePayrollPeriod(context.tenantId, period.id);
  return Response.json({ item: period }, { status: 201 });
} catch (error) { return crmError(error); } }
