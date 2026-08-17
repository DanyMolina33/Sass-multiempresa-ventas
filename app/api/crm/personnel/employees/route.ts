import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";

const employeeInclude = { jobPosition: true, compensationPlan: { select: { id: true, name: true, mode: true } }, user: { select: { id: true, name: true, email: true, role: { select: { code: true } } } }, pensionRegimeRate: true, store: true } as const;

export async function GET(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const search = new URL(request.url).searchParams;
  const status = search.get("status") || undefined, jobPositionId = search.get("jobPositionId") || undefined, employmentType = search.get("employmentType") || undefined, term = search.get("search") || undefined;
  const items = await getPrisma().employee.findMany({
    where: { tenantId: context.tenantId, ...(status ? { status: status as never } : {}), ...(jobPositionId ? { jobPositionId } : {}), ...(employmentType ? { employmentType: employmentType as never } : {}), ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { document: { contains: term, mode: "insensitive" } }] } : {}) },
    include: employeeInclude, orderBy: { name: "asc" },
  });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const prisma = getPrisma();
  const name = String(body.name ?? "").trim();
  if (!name) throw new Response("El nombre del trabajador es obligatorio", { status: 400 });
  const jobPositionId = String(body.jobPositionId ?? "");
  const jobPosition = await prisma.jobPosition.findFirst({ where: { id: jobPositionId, tenantId: context.tenantId } });
  if (!jobPosition) throw new Response("Cargo fuera del tenant", { status: 403 });
  const compensationPlanId = String(body.compensationPlanId ?? "");
  const plan = await prisma.compensationPlan.findFirst({ where: { id: compensationPlanId, tenantId: context.tenantId } });
  if (!plan) throw new Response("Plan de compensación fuera del tenant", { status: 403 });
  const employmentType = String(body.employmentType ?? "");
  if (!["EN_PLANILLA", "FUERA_PLANILLA"].includes(employmentType)) throw new Response("Selecciona el vínculo del trabajador", { status: 400 });
  if (!body.hireDate) throw new Response("La fecha de ingreso es obligatoria", { status: 400 });
  const userId = body.userId ? String(body.userId) : null;
  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: context.tenantId } });
    if (!user) throw new Response("Usuario fuera del tenant", { status: 403 });
    const alreadyLinked = await prisma.employee.findUnique({ where: { userId } });
    if (alreadyLinked) throw new Response("Ese usuario ya está vinculado a otro trabajador", { status: 409 });
  }
  const pensionRegimeRateId = employmentType === "EN_PLANILLA" && body.pensionRegimeRateId ? String(body.pensionRegimeRateId) : null;
  if (pensionRegimeRateId) {
    const rate = await prisma.pensionRegimeRate.findFirst({ where: { id: pensionRegimeRateId, tenantId: context.tenantId } });
    if (!rate) throw new Response("Tasa pensionaria fuera del tenant", { status: 403 });
  }
  // Optional — companies that don't work with branches simply never set this.
  const storeId = body.storeId ? String(body.storeId) : null;
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, tenantId: context.tenantId } });
    if (!store) throw new Response("Tienda fuera del tenant", { status: 403 });
  }
  const item = await prisma.employee.create({ data: {
    tenantId: context.tenantId, name, document: String(body.document ?? "").trim() || null, jobPositionId,
    status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    hireDate: new Date(`${String(body.hireDate).slice(0, 10)}T00:00:00Z`),
    terminationDate: body.terminationDate ? new Date(`${String(body.terminationDate).slice(0, 10)}T00:00:00Z`) : null,
    employmentType: employmentType as never, compensationPlanId, userId, pensionRegimeRateId, storeId,
  }, include: employeeInclude });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
