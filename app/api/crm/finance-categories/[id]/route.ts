import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireFinanceWrite } from "@/lib/finance-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().financeCategory.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Categoría fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const name = body.name === undefined ? undefined : String(body.name).trim();
  if (name !== undefined && !name) throw new Response("El nombre de la categoría es obligatorio", { status: 400 });
  if (name && name !== current.name) {
    const clash = await getPrisma().financeCategory.findFirst({ where: { tenantId: context.tenantId, type: current.type, name, id: { not: id } } });
    if (clash) throw new Response("Ya existe una categoría con ese nombre para este tipo", { status: 409 });
  }
  const item = await getPrisma().financeCategory.update({ where: { id }, data: { name, active: body.active === undefined ? undefined : Boolean(body.active) } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().financeCategory.findFirst({ where: { id, tenantId: context.tenantId }, include: { _count: { select: { entries: true } } } });
  if (!current) throw new Response("Categoría fuera del tenant", { status: 403 });
  if (current._count.entries > 0) throw new Response("No se puede eliminar una categoría con movimientos registrados; desactívala en su lugar.", { status: 409 });
  await getPrisma().financeCategory.delete({ where: { id } });
  return Response.json({ ok: true });
} catch (error) { return crmError(error); } }
