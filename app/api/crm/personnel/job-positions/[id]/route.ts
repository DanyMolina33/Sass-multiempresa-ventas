import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelWrite } from "@/lib/payroll-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().jobPosition.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Cargo fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const name = body.name === undefined ? undefined : String(body.name).trim();
  if (name !== undefined && !name) throw new Response("El nombre del cargo es obligatorio", { status: 400 });
  if (name && name !== current.name) {
    const clash = await getPrisma().jobPosition.findFirst({ where: { tenantId: context.tenantId, name, id: { not: id } } });
    if (clash) throw new Response("Ya existe un cargo con ese nombre", { status: 409 });
  }
  const item = await getPrisma().jobPosition.update({ where: { id }, data: { name, active: body.active === undefined ? undefined : Boolean(body.active) } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
