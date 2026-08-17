import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireFinanceWrite } from "@/lib/finance-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().financeEntry.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Movimiento fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const categoryId = body.categoryId === undefined ? undefined : String(body.categoryId);
  const type = (body.type === undefined ? current.type : String(body.type)) as never;
  if (categoryId) {
    const category = await getPrisma().financeCategory.findFirst({ where: { id: categoryId, tenantId: context.tenantId } });
    if (!category) throw new Response("Categoría fuera del tenant", { status: 403 });
    if (category.type !== type) throw new Response("La categoría seleccionada no corresponde al tipo de movimiento", { status: 400 });
  }
  const concept = body.concept === undefined ? undefined : String(body.concept).trim();
  if (concept !== undefined && !concept) throw new Response("El concepto es obligatorio", { status: 400 });
  const amount = body.amount === undefined ? undefined : Number(body.amount);
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) throw new Response("El monto debe ser un número mayor a cero", { status: 400 });
  const entryDate = body.entryDate === undefined ? undefined : new Date(`${body.entryDate}T00:00:00Z`);
  const item = await getPrisma().financeEntry.update({ where: { id }, data: { type: body.type === undefined ? undefined : type, categoryId, concept, amount, entryDate, currency: body.currency === undefined ? undefined : String(body.currency).trim().toUpperCase(), notes: body.notes === undefined ? undefined : String(body.notes).trim() || null, documentName: body.documentName === undefined ? undefined : String(body.documentName).trim() || null, documentReference: body.documentReference === undefined ? undefined : String(body.documentReference).trim() || null }, include: { category: { select: { id: true, name: true } }, registeredBy: { select: { id: true, name: true } } } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "finance"); requireFinanceWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().financeEntry.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Movimiento fuera del tenant", { status: 403 });
  await getPrisma().financeEntry.delete({ where: { id } });
  return Response.json({ ok: true });
} catch (error) { return crmError(error); } }
