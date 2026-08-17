import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead } from "@/lib/payroll-access";

export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const prisma = getPrisma();
  const [jobPositions, compensationPlans, pensionRegimeRates, users, stores] = await Promise.all([
    prisma.jobPosition.findMany({ where: { tenantId: context.tenantId, active: true }, orderBy: { name: "asc" } }),
    prisma.compensationPlan.findMany({ where: { tenantId: context.tenantId, active: true }, select: { id: true, name: true, mode: true }, orderBy: { name: "asc" } }),
    prisma.pensionRegimeRate.findMany({ where: { tenantId: context.tenantId, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, select: { id: true, name: true, email: true, role: { select: { code: true } }, employee: { select: { id: true } } }, orderBy: { name: "asc" } }),
    prisma.store.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({ jobPositions, compensationPlans, pensionRegimeRates, users, stores, role: context.role });
} catch (error) { return crmError(error); } }
