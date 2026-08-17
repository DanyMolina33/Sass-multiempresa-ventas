import { getPrisma } from "@/lib/prisma";

// effectiveAccess = tenantModule.enabled AND userModuleGrant.enabled AND role/permission (section 6 of the
// Supervisor Portal block). COMPANY_ADMIN/SUPER_ADMIN are the entitlement administrators, not consumers, so they
// bypass the per-user grant layer entirely and get every tenant-enabled module.
const ADMIN_ROLES = ["COMPANY_ADMIN", "SUPER_ADMIN"] as const;

export async function getTenantEnabledModules(tenantId: string) {
  return getPrisma().tenantModule.findMany({ where: { tenantId, enabled: true }, select: { moduleId: true, module: { select: { code: true, name: true } } } });
}

export async function getEffectiveModuleCodes(tenantId: string, userId: string, roleCode: string): Promise<Set<string>> {
  const enabled = await getTenantEnabledModules(tenantId);
  if ((ADMIN_ROLES as readonly string[]).includes(roleCode)) return new Set(enabled.map((tm) => tm.module.code));
  const grants = await getPrisma().userModuleGrant.findMany({ where: { userId, enabled: true, moduleId: { in: enabled.map((tm) => tm.moduleId) } }, select: { moduleId: true } });
  const grantedIds = new Set(grants.map((g) => g.moduleId));
  return new Set(enabled.filter((tm) => grantedIds.has(tm.moduleId)).map((tm) => tm.module.code));
}

export async function hasModuleAccess(tenantId: string, userId: string, roleCode: string, moduleCode: string) {
  return (await getEffectiveModuleCodes(tenantId, userId, roleCode)).has(moduleCode);
}

export async function requireModuleAccess(tenantId: string, userId: string, roleCode: string, moduleCode: string) {
  if (!(await hasModuleAccess(tenantId, userId, roleCode, moduleCode))) throw new Response(`Módulo "${moduleCode}" no habilitado para este usuario`, { status: 403 });
}

// Full picture for the Gerente's "Módulos habilitados" editor (section 80): every catalog module, whether the
// tenant has it, and whether this specific user has an active grant for it.
export async function getModuleGrantOverview(tenantId: string, userId: string) {
  const [modules, tenantModules, grants] = await Promise.all([
    getPrisma().module.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    getPrisma().tenantModule.findMany({ where: { tenantId }, select: { moduleId: true, enabled: true } }),
    getPrisma().userModuleGrant.findMany({ where: { userId }, select: { moduleId: true, enabled: true } }),
  ]);
  const tenantEnabledById = new Map(tenantModules.map((tm) => [tm.moduleId, tm.enabled]));
  const grantedById = new Map(grants.map((g) => [g.moduleId, g.enabled]));
  return modules.map((module) => ({
    id: module.id, code: module.code, name: module.name,
    tenantEnabled: tenantEnabledById.get(module.id) ?? false,
    granted: grantedById.get(module.id) ?? false,
  }));
}
