import { getSelectedTenant, isSuperAdmin, requireSession } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/module-entitlement";

// WhatsApp is independent (section 2): TenantModule.whatsapp AND UserModuleGrant.whatsapp AND RBAC. Deliberately
// NOT requireCrmContext() — that gates on the "crm" module, a different entitlement entirely.
export async function requireWhatsAppContext() {
  const session = await requireSession();
  const administrativeTenant = isSuperAdmin(session) ? await getSelectedTenant() : null;
  const tenantId = administrativeTenant?.id ?? session.user.tenantId;
  if (!tenantId) throw new Response("Selecciona una empresa para acceder a WhatsApp.", { status: 400 });
  const role = session.user.role.code;
  const enabled = await hasModuleAccess(tenantId, session.user.id, role, "whatsapp");
  if (!enabled) throw new Response("WhatsApp no está habilitado para esta empresa o usuario", { status: 403 });
  return { session, tenantId, userId: session.user.id, role };
}

// Connecting/disconnecting Meta, viewing WABA configuration, and administering grants are COMPANY_ADMIN-only
// (section 10/21) — SUPERVISOR/AGENT never reach these regardless of their own module grant.
export function requireCompanyAdminForWhatsApp(role: string) {
  if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") throw new Response("Solo el Gerente puede administrar la conexión de WhatsApp", { status: 403 });
}

export async function whatsAppError(error: unknown) {
  if (error instanceof Response) return Response.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
  console.error("WhatsApp integration error", error);
  return Response.json({ message: "No fue posible completar la operación de WhatsApp." }, { status: 400 });
}
