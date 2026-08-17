import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";

// Section 47: Promotor can see (and move the status of, via the shared /api/crm/action-plans/[id] PATCH) plans
// assigned to them — never edit the objective itself, which stays locked to the Supervisor who created it.
export async function GET() {
  try {
    const context = await requireCrmContext();
    const plans = await getPrisma().actionPlan.findMany({ where: { tenantId: context.tenantId, assignedUserId: context.userId }, orderBy: { createdAt: "desc" } });
    return Response.json({ plans });
  } catch (error) { return crmError(error); }
}
