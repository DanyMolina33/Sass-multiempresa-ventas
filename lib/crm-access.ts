import { getSelectedTenant, isSuperAdmin, requireSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function requireCrmContext() {
  const session = await requireSession();
  const administrativeTenant = isSuperAdmin(session) ? await getSelectedTenant() : null;
  const tenantId = administrativeTenant?.id ?? session.user.tenantId;
  if (!tenantId) throw new Response("Selecciona una empresa para acceder al CRM.", { status: 400 });
  const enabled = await getPrisma().tenantModule.findFirst({ where: { tenantId, enabled: true, module: { code: "crm" } } });
  if (!enabled) throw new Response("CRM no está activo para esta empresa", { status: 403 });
  const role = session.user.role.code;
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
