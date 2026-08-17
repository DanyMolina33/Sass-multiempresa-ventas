import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { isCrmFeatureActive } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";

// Store is used both by Pago de Personal (asignación de trabajadores) and Gestión Comercial (catálogo de
// tiendas/sucursales) — accessible if either feature is active, so neither screen depends on the other being on.
async function requireStoresFeature(tenantId: string) {
  if (!(await isCrmFeatureActive(tenantId, "payroll")) && !(await isCrmFeatureActive(tenantId, "commercial-management"))) throw new Response("Función CRM no activa para esta empresa", { status: 403 });
}

export async function GET() { try {
  const context = await requireCrmContext(); await requireStoresFeature(context.tenantId); requirePersonnelRead(context.role);
  const items = await getPrisma().store.findMany({ where: { tenantId: context.tenantId }, include: { _count: { select: { employees: true } } }, orderBy: { name: "asc" } });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireStoresFeature(context.tenantId); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) throw new Response("El nombre de la tienda es obligatorio", { status: 400 });
  const code = String(body.code ?? "").trim() || null;
  const item = await getPrisma().store.create({ data: { tenantId: context.tenantId, name, code, active: body.active !== false } });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
