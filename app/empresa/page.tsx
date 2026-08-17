import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function CompanyPage() {
  const session = await requirePageSession();
  if (isSuperAdmin(session)) redirect("/");
  if (session.user.mustChangePassword) redirect("/cambiar-password");
  if (session.user.role.code === "AGENT") redirect("/crm/promoter-space");
  if (session.user.role.code === "SUPERVISOR") redirect("/crm/supervisor-space");
  return <DashboardShell section="dashboard" session={safeSession(session)} companyMode />;
}
