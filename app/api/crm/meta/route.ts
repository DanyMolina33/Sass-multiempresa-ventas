import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getTenantCrmConfiguration } from "@/lib/vertical-template";

export async function GET() {
  try {
    const context = await requireCrmContext();
    const usersWhere = context.teamUserIds ? { id: { in: context.teamUserIds } } : {};
    const [stages, users, products, commercialPlans, leads, customers, configuration] = await Promise.all([
      getPrisma().pipelineStage.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, orderBy: { order: "asc" } }),
      getPrisma().user.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE", ...usersWhere }, select: { id: true, name: true, role: { select: { code: true } }, supervisorId: true }, orderBy: { name: "asc" } }),
      getPrisma().product.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } }),
      getPrisma().commercialPlan.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      getPrisma().lead.findMany({ where: { tenantId: context.tenantId, ...(context.teamUserIds ? { assignedUserId: { in: context.teamUserIds } } : {}) }, select: { id: true, name: true } }),
      getPrisma().customer.findMany({ where: { tenantId: context.tenantId, ...(context.teamUserIds ? { ownerUserId: { in: context.teamUserIds } } : {}) }, select: { id: true, name: true } }),
      getTenantCrmConfiguration(context.tenantId),
    ]);
    const activeFeatures=configuration?configuration.verticalTemplate.features.filter(feature=>feature.tenantFeatures.some(item=>item.active)).map(feature=>feature.code):["leads","customers","sales","follow-ups","products","commercial-plans"];
    return Response.json({ stages, users, products, commercialPlans, leads, customers, role: context.role, activeFeatures });
  } catch (error) { return crmError(error); }
}
