import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { companyModuleEnabled, getSelectedTenant, isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";
import { isCrmFeatureActive, RESTRICTED_CRM_ROLES, RESTRICTED_CRM_VIEWS } from "@/lib/vertical-template";

const views = ["leads","customers","sales","follow-ups","products","commercial-plans","commissions","reconciliation","finance","payroll","commercial-management","promoter-space"] as const;
export const dynamic = "force-dynamic";
export default async function CrmPage({params}:{params:Promise<{view:string}>}){const {view}=await params;if(!views.includes(view as typeof views[number]))redirect("/crm");const session=await requirePageSession();if(!isSuperAdmin(session)&&!companyModuleEnabled(session,"crm"))redirect("/empresa");
  // Tenant-active isn't enough for economic/administrative views — the session's own role must also be authorized (mirrors the same role list already enforced server-side in the corresponding API routes).
  if(!isSuperAdmin(session)&&(RESTRICTED_CRM_VIEWS as readonly string[]).includes(view)&&!(RESTRICTED_CRM_ROLES as readonly string[]).includes(session.user.role.code))redirect("/empresa");
  const adminTenant=isSuperAdmin(session)?await getSelectedTenant():null;const tenantId=adminTenant?.id??session.user.tenantId;if(tenantId&&!await isCrmFeatureActive(tenantId,view))redirect("/crm");return <DashboardShell section="crm" session={safeSession(session)} companyMode={!isSuperAdmin(session)} crmView={view as typeof views[number]} adminCrmTenant={adminTenant?{id:adminTenant.id,name:adminTenant.name}:null} crmContextMissing={isSuperAdmin(session)&&!adminTenant}/>}
