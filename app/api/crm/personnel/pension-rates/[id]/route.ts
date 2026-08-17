import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelWrite } from "@/lib/payroll-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const { id } = await params;
  const current = await getPrisma().pensionRegimeRate.findFirst({ where: { id, tenantId: context.tenantId } });
  if (!current) throw new Response("Tasa fuera del tenant", { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const item = await getPrisma().pensionRegimeRate.update({ where: { id }, data: { active: body.active === undefined ? undefined : Boolean(body.active) } });
  return Response.json({ item });
} catch (error) { return crmError(error); } }
