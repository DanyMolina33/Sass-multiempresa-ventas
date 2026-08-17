import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { companyModuleEnabled, getSelectedTenant, isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";
import { isCrmFeatureActive, RESTRICTED_CRM_ROLES, RESTRICTED_CRM_VIEWS } from "@/lib/vertical-template";

const views = ["leads","customers","sales","follow-ups","products","commercial-plans","commissions","reconciliation","finance","payroll","commercial-management","promoter-space"] as const;
// Sub-pages of the Promoter Portal (sidebar: Seguimientos, Mi ranking, Mis comisiones, Agenda, Mis metas, Mi
// perfil). They aren't independently toggleable CRM features — they're always available once "promoter-space"
// itself is active — so they're checked against that feature instead of having their own vertical-template entry.
const PROMOTER_SUBVIEWS = ["promoter-followups","promoter-ranking","promoter-commissions","promoter-agenda","promoter-goals","promoter-profile"] as const;
// Same treatment for the Supervisor Portal sidebar. Gated the same way (feature="promoter-space", the shared CRM
// operational base) rather than adding a separate vertical-template entry for a sub-page that only ever appears
// once the parent feature is on.
const SUPERVISOR_SUBVIEWS = ["supervisor-space","supervisor-team","supervisor-goals","supervisor-ranking","supervisor-performance","supervisor-messages","supervisor-action-plans","supervisor-followups","supervisor-agenda","supervisor-alerts","supervisor-profile"] as const;
export const dynamic = "force-dynamic";
export default async function CrmPage({params}:{params:Promise<{view:string}>}){const {view}=await params;const isPromoterSubview=(PROMOTER_SUBVIEWS as readonly string[]).includes(view);const isSupervisorSubview=(SUPERVISOR_SUBVIEWS as readonly string[]).includes(view);if(!views.includes(view as typeof views[number])&&!isPromoterSubview&&!isSupervisorSubview)redirect("/crm");const session=await requirePageSession();if(session.user.mustChangePassword)redirect("/cambiar-password");if(!isSuperAdmin(session)&&!companyModuleEnabled(session,"crm"))redirect("/empresa");
  // Tenant-active isn't enough for economic/administrative views — the session's own role must also be authorized (mirrors the same role list already enforced server-side in the corresponding API routes).
  if(!isSuperAdmin(session)&&(RESTRICTED_CRM_VIEWS as readonly string[]).includes(view)&&!(RESTRICTED_CRM_ROLES as readonly string[]).includes(session.user.role.code))redirect("/empresa");
  if(isSupervisorSubview&&!isSuperAdmin(session)&&session.user.role.code!=="SUPERVISOR")redirect("/empresa");
  const adminTenant=isSuperAdmin(session)?await getSelectedTenant():null;const tenantId=adminTenant?.id??session.user.tenantId;if(tenantId&&!await isCrmFeatureActive(tenantId,(isPromoterSubview||isSupervisorSubview)?"promoter-space":view))redirect("/crm");return <DashboardShell section="crm" session={safeSession(session)} companyMode={!isSuperAdmin(session)} crmView={view as typeof views[number]} adminCrmTenant={adminTenant?{id:adminTenant.id,name:adminTenant.name}:null} crmContextMissing={isSuperAdmin(session)&&!adminTenant}/>}
