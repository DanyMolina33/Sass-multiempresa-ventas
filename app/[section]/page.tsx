import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { companyModuleEnabled, getSelectedTenant, hasPermission, isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";
import { roleLandingPath } from "@/lib/role-routes";
import { sections, type SectionKey } from "@/lib/navigation";
import { hasModuleAccess } from "@/lib/module-entitlement";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections) || section === "dashboard") notFound();
  const session = await requirePageSession();
  if (section === "crm") redirect("/crm");
  if (section === "usuarios") {
    // Hiding the sidebar link isn't enough — a Promotor typing /usuarios directly must be rejected server-side too.
    const allowed = isSuperAdmin(session) || hasPermission(session, "users.read") || hasPermission(session, "users.manage");
    if (!allowed) redirect(roleLandingPath(session.user.role.code));
  } else if (!isSuperAdmin(session) && !companyModuleEnabled(session, section)) redirect("/empresa");
  // WhatsApp is independent (block 32, section 2): tenant-level enablement isn't enough on its own — the signed-in
  // user also needs their own UserModuleGrant, unlike the other placeholder modules on this generic route.
  if (section === "whatsapp" && !isSuperAdmin(session) && session.user.tenantId) {
    const granted = await hasModuleAccess(session.user.tenantId, session.user.id, session.user.role.code, "whatsapp");
    if (!granted) redirect("/empresa");
  }
  const selectedTenant=isSuperAdmin(session)?await getSelectedTenant():null;
  return <DashboardShell section={section as SectionKey} session={safeSession(session)} companyMode={!isSuperAdmin(session)} adminCrmTenant={selectedTenant?{id:selectedTenant.id,name:selectedTenant.name}:null} />;
}
