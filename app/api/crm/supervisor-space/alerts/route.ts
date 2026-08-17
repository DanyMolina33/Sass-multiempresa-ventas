import { crmError, requireCrmContext } from "@/lib/crm-access";
import { deriveSupervisorAlerts } from "@/lib/supervisor-alerts";

export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    return Response.json({ alerts: await deriveSupervisorAlerts(context.tenantId, context.userId) });
  } catch (error) { return crmError(error); }
}
