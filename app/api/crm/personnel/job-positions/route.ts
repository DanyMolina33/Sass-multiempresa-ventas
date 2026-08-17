import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";

export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const items = await getPrisma().jobPosition.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) throw new Response("El nombre del cargo es obligatorio", { status: 400 });
  const existing = await getPrisma().jobPosition.findFirst({ where: { tenantId: context.tenantId, name } });
  if (existing) throw new Response("Ya existe un cargo con ese nombre", { status: 409 });
  const item = await getPrisma().jobPosition.create({ data: { tenantId: context.tenantId, name, active: body.active !== false } });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
