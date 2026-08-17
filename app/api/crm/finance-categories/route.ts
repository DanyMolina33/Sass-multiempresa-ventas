import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireFinanceRead, requireFinanceWrite } from "@/lib/finance-access";

const TYPES = ["INGRESO", "GASTO"] as const;

export async function GET(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceRead(context.role);
  const type = new URL(request.url).searchParams.get("type") || undefined;
  if (type && !TYPES.includes(type as never)) throw new Response("Tipo de categoría inválido", { status: 400 });
  const items = await getPrisma().financeCategory.findMany({ where: { tenantId: context.tenantId, ...(type ? { type: type as never } : {}) }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const type = String(body.type ?? ""), name = String(body.name ?? "").trim();
  if (!TYPES.includes(type as never)) throw new Response("Selecciona si la categoría es de ingreso o gasto", { status: 400 });
  if (!name) throw new Response("El nombre de la categoría es obligatorio", { status: 400 });
  const existing = await getPrisma().financeCategory.findFirst({ where: { tenantId: context.tenantId, type: type as never, name } });
  if (existing) throw new Response("Ya existe una categoría con ese nombre para este tipo", { status: 409 });
  const item = await getPrisma().financeCategory.create({ data: { tenantId: context.tenantId, type: type as never, name, active: body.active !== false } });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
