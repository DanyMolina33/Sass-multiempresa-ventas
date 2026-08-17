import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { isCrmFeatureActive } from "@/lib/vertical-template";
import { requirePersonnelWrite } from "@/lib/payroll-access";

async function requireStoresFeature(tenantId: string) {
  if (!(await isCrmFeatureActive(tenantId, "payroll")) && !(await isCrmFeatureActive(tenantId, "commercial-management"))) throw new Response("Función CRM no activa para esta empresa", { status: 403 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireStoresFeature(context.tenantId); requirePersonnelWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().store.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Tienda fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const name = body.name === undefined ? undefined : String(body.name).trim();
  if (name !== undefined && !name) throw new Response("El nombre de la tienda es obligatorio", { status: 400 });
  const item = await getPrisma().store.update({ where: { id }, data: { name, code: body.code === undefined ? undefined : String(body.code).trim() || null, active: body.active === undefined ? undefined : Boolean(body.active) } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
