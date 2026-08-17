import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { companyModuleEnabled, getSelectedTenant, isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";
import { getFirstActiveCrmFeature, isCrmFeatureActive } from "@/lib/vertical-template";

export const dynamic="force-dynamic";
export default async function CrmIndex(){
  const session=await requirePageSession();if(!isSuperAdmin(session)&&!companyModuleEnabled(session,"crm"))redirect("/empresa");
  const adminTenant=isSuperAdmin(session)?await getSelectedTenant():null,tenantId=adminTenant?.id??session.user.tenantId;
  if(tenantId){
    // AGENT/Promotor lands on their own space first, regardless of feature creation/seed order, when it's active.
    if(session.user.role.code==="AGENT"&&await isCrmFeatureActive(tenantId,"promoter-space"))redirect("/crm/promoter-space");
    const first=await getFirstActiveCrmFeature(tenantId);if(first)redirect(`/crm/${first}`);
  }
  return <DashboardShell section="crm" session={safeSession(session)} companyMode={!isSuperAdmin(session)} adminCrmTenant={adminTenant?{id:adminTenant.id,name:adminTenant.name}:null} crmContextMissing={isSuperAdmin(session)&&!adminTenant}/>;
}
