import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSelectedTenant, isSuperAdmin, requirePageSession, safeSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await requirePageSession();
  if (!isSuperAdmin(session)) redirect("/empresa");
  const selectedTenant=await getSelectedTenant();
  return <DashboardShell section="dashboard" session={safeSession(session)} adminCrmTenant={selectedTenant?{id:selectedTenant.id,name:selectedTenant.name}:null} />;
}
