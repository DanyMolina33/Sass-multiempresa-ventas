import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";

const employeeInclude = { jobPosition: true, compensationPlan: { include: { commissionRule: { include: { tiers: true } }, components: true } }, user: { select: { id: true, name: true, email: true, role: { select: { code: true } } } }, pensionRegimeRate: true, store: true } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const { id } = await params;
  const employee = await getPrisma().employee.findFirst({ where: { id, tenantId: context.tenantId }, include: employeeInclude });
  if (!employee) throw new Response("Trabajador fuera del tenant", { status: 403 });
  const latestEntry = await getPrisma().payrollEntry.findFirst({ where: { tenantId: context.tenantId, employeeId: id, current: true }, orderBy: { calculatedAt: "desc" }, include: { payrollPeriod: { select: { id: true, code: true, status: true } } } });
  return Response.json({ employee, latestEntry });
} catch (error) { return crmError(error); } }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const { id } = await params, prisma = getPrisma();
  const current = await prisma.employee.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Trabajador fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) { const name = String(body.name).trim(); if (!name) throw new Response("El nombre es obligatorio", { status: 400 }); data.name = name; }
  if (body.document !== undefined) data.document = String(body.document).trim() || null;
  if (body.status !== undefined) data.status = body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  if (body.terminationDate !== undefined) data.terminationDate = body.terminationDate ? new Date(`${String(body.terminationDate).slice(0, 10)}T00:00:00Z`) : null;
  if (body.jobPositionId !== undefined) {
    const jobPosition = await prisma.jobPosition.findFirst({ where: { id: String(body.jobPositionId), tenantId: context.tenantId } });
    if (!jobPosition) throw new Response("Cargo fuera del tenant", { status: 403 });
    data.jobPositionId = jobPosition.id;
  }
  if (body.compensationPlanId !== undefined) {
    const plan = await prisma.compensationPlan.findFirst({ where: { id: String(body.compensationPlanId), tenantId: context.tenantId } });
    if (!plan) throw new Response("Plan de compensación fuera del tenant", { status: 403 });
    data.compensationPlanId = plan.id;
  }
  const employmentType = body.employmentType !== undefined ? String(body.employmentType) : current.employmentType;
  if (body.employmentType !== undefined) { if (!["EN_PLANILLA", "FUERA_PLANILLA"].includes(employmentType)) throw new Response("Vínculo inválido", { status: 400 }); data.employmentType = employmentType; }
  if (body.pensionRegimeRateId !== undefined) {
    const pensionRegimeRateId = employmentType === "EN_PLANILLA" && body.pensionRegimeRateId ? String(body.pensionRegimeRateId) : null;
    if (pensionRegimeRateId) { const rate = await prisma.pensionRegimeRate.findFirst({ where: { id: pensionRegimeRateId, tenantId: context.tenantId } }); if (!rate) throw new Response("Tasa pensionaria fuera del tenant", { status: 403 }); }
    data.pensionRegimeRateId = pensionRegimeRateId;
  } else if (body.employmentType !== undefined && employmentType === "FUERA_PLANILLA") data.pensionRegimeRateId = null;
  if (body.userId !== undefined) {
    const userId = body.userId ? String(body.userId) : null;
    if (userId) {
      const user = await prisma.user.findFirst({ where: { id: userId, tenantId: context.tenantId } });
      if (!user) throw new Response("Usuario fuera del tenant", { status: 403 });
      const alreadyLinked = await prisma.employee.findUnique({ where: { userId } });
      if (alreadyLinked && alreadyLinked.id !== id) throw new Response("Ese usuario ya está vinculado a otro trabajador", { status: 409 });
    }
    data.userId = userId;
  }
  if (body.storeId !== undefined) {
    const storeId = body.storeId ? String(body.storeId) : null;
    if (storeId) { const store = await prisma.store.findFirst({ where: { id: storeId, tenantId: context.tenantId } }); if (!store) throw new Response("Tienda fuera del tenant", { status: 403 }); }
    data.storeId = storeId;
  }
  const item = await prisma.employee.update({ where: { id }, data, include: employeeInclude });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
