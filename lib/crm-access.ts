import { getSelectedTenant, isSuperAdmin, requireSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/module-entitlement";

export async function requireCrmContext() {
  const session = await requireSession();
  const administrativeTenant = isSuperAdmin(session) ? await getSelectedTenant() : null;
  const tenantId = administrativeTenant?.id ?? session.user.tenantId;
  if (!tenantId) throw new Response("Selecciona una empresa para acceder al CRM.", { status: 400 });
  const role = session.user.role.code;
  // Tenant entitlement AND, for SUPERVISOR/AGENT, the per-user grant too (section 6: "no basta esconder menú").
  // COMPANY_ADMIN/SUPER_ADMIN bypass the grant layer inside hasModuleAccess itself.
  const crmEnabled = await hasModuleAccess(tenantId, session.user.id, role, "crm");
  if (!crmEnabled) throw new Response("CRM no está activo para esta empresa", { status: 403 });
  const agentIds = role === "SUPERVISOR" ? (await getPrisma().user.findMany({ where: { tenantId, supervisorId: session.user.id, status: "ACTIVE" }, select: { id: true } })).map((user) => user.id) : [];
  // A SUPERVISOR linked to an Employee with a store assignment is additionally scoped to that one store (demo's
  // "usuario de tienda" access). COMPANY_ADMIN/SUPER_ADMIN stay unrestricted regardless of any Employee link.
  const storeId = role === "SUPERVISOR" ? (await getPrisma().employee.findFirst({ where: { tenantId, userId: session.user.id }, select: { storeId: true } }))?.storeId ?? null : null;
  // A store-linked SUPERVISOR ("usuario de tienda") is scoped by storeId alone — the store boundary replaces the
  // supervisorId-based team hierarchy, since Modo Tienda means seeing every promoter/sale in that store, not just
  // formal subordinates. A SUPERVISOR without a store keeps the original self+subordinates restriction.
  const teamUserIds = ["COMPANY_ADMIN", "SUPER_ADMIN"].includes(role) ? null : role === "SUPERVISOR" ? (storeId ? null : [session.user.id, ...agentIds]) : [session.user.id];
  return { session, tenantId, tenantName: administrativeTenant?.name ?? session.user.tenant?.name ?? null, administrativeMode: isSuperAdmin(session), userId: session.user.id, role, storeId, teamUserIds };
}

export async function crmError(error: unknown) {
  if (error instanceof Response) return Response.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
  console.error("CRM operation failed", error);
  return Response.json({ message: "No fue posible completar la operación CRM." }, { status: 400 });
}

export async function validateAssignableUser(context: Awaited<ReturnType<typeof requireCrmContext>>, userId: string) {
  const user = await getPrisma().user.findFirst({ where: { id: userId, tenantId: context.tenantId, status: "ACTIVE" }, include: { role: true } });
  if (!user) throw new Response("Usuario no válido para este tenant", { status: 403 });
  if (context.teamUserIds && !context.teamUserIds.includes(user.id)) throw new Response("Usuario fuera del equipo permitido", { status: 403 });
  return user;
}

export function assignedScope(context: Awaited<ReturnType<typeof requireCrmContext>>, field: "assignedUserId" | "ownerUserId" | "agentId") {
  return context.teamUserIds ? { [field]: { in: context.teamUserIds } } : {};
}

export function storeScope(context: Awaited<ReturnType<typeof requireCrmContext>>) {
  return context.storeId ? { storeId: context.storeId } : {};
}

// scope=self|team only ever NARROWS visibility (never expands it), so it can never escape the tenant/team boundary
// already enforced by requireCrmContext — this is how a SUPERVISOR's "Mis ventas" (personal) and "Ventas del
// equipo" (subordinates only) reuse the exact same view/API instead of two parallel engines.
//
// scope="self" always resolves to exactly [userId], regardless of whether context.teamUserIds is null — a
// store-linked ("Modo Tienda") SUPERVISOR has teamUserIds=null (unrestricted store-wide), and checking that BEFORE
// scope would silently return the full unrestricted list for "self" too, mixing personal and team sales exactly
// like section 16 forbids. scope="team" for a SUPERVISOR always resolves to their real subordinates (User.supervisorId
// = their id) via a direct query — never derived from teamUserIds, which for Modo Tienda is store-wide, not
// hierarchy-based, and would otherwise leak store-mates who aren't formal subordinates into "team" too.
export async function resolveScopedTeamUserIds(context: Awaited<ReturnType<typeof requireCrmContext>>, scope: string | null): Promise<string[] | null> {
  if (!scope) return context.teamUserIds;
  if (scope === "self") return [context.userId];
  if (scope === "team") {
    if (context.role !== "SUPERVISOR") return context.teamUserIds ? context.teamUserIds.filter((id) => id !== context.userId) : context.teamUserIds;
    const subordinates = await getPrisma().user.findMany({ where: { tenantId: context.tenantId, supervisorId: context.userId, status: "ACTIVE" }, select: { id: true } });
    return subordinates.map((u) => u.id);
  }
  return context.teamUserIds;
}
