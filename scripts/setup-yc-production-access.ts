import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { generateUniqueAccessCode } from "../lib/access-code";

// BLOQUE 35B — acceso puntual, idempotente, para dejar el tenant YC Telecomunicaciones y sus 3 usuarios de
// referencia (Gerente/Supervisor/Promotor) operativos en la base de datos que esté configurada en DATABASE_URL
// en el entorno donde se ejecute este script (nunca hardcoded aquí — así el mismo script sirve para inspección
// local y, corrido dentro del contenedor real, para producción).
//
// Modo por defecto: SOLO INSPECCIONA, no escribe nada. Pasar --apply para crear lo que falte.
// Nunca borra, nunca trunca, nunca toca Sale/Customer/Lead/ReconciliationImport/FinanceEntry/etc.
//
// Referencia usada para no inventar nada al crear el tenant desde cero (capturada del tenant YC real ya
// validado en bloques anteriores): plan "business", plantilla vertical "CRM_TELECOM" con sus features,
// módulos habilitados, y el set de permisos que cada rol tiene HOY en producción de facto.
const PLAN_CODE = "business";
const VERTICAL_TEMPLATE_CODE = "CRM_TELECOM";
const ENABLED_MODULE_CODES = ["whatsapp", "sms-center", "call-center", "reportes", "crm"];
const MAX_USERS = 25;
const CRM_FEATURE_CODES = [
  "sales", "leads", "commercial-plans", "customers", "follow-ups", "commissions", "advanced-dashboard",
  "products", "reconciliation", "finance", "payroll", "commercial-management", "promoter-space",
  "commercial-stores", "commercial-goals", "commercial-action-plans",
];
const ROLE_PERMISSIONS: Record<string, string[]> = {
  COMPANY_ADMIN: ["goals.view","goals.manage","action-plans.view","action-plans.create","action-plans.edit","action-plans.assign","action-plans.close","tenant.read","users.read","users.manage","modules.read","reports.read","operation.view","operation.create","operation.edit","operation.export","team.view","team.create","team.edit","team.assign","team.transfer","users.permissions","commissions.view","commissions.manage","reconciliation.view","reconciliation.manage","finance.view","finance.manage","payroll.view","payroll.manage","users.credentials.reset"],
  SUPERVISOR: ["goals.view","goals.manage","action-plans.view","action-plans.create","action-plans.edit","action-plans.assign","action-plans.close","tenant.read","reports.read","operations.basic","operation.view","operation.create","operation.edit","team.view"],
  AGENT: ["tenant.read","operations.basic","operation.view","operation.create","operation.edit","goals.view","action-plans.view"],
};
const TENANT_SLUG = "yc-telecomunicaciones";
const ROLE_NAMES: Record<string, string> = { COMPANY_ADMIN: "Administrador de empresa", SUPERVISOR: "Supervisor", AGENT: "Promotor" };
const USERS = [
  { key: "yaki", name: "Yaki Chávez", email: "yaki.chavez@yc-telecomunicaciones.crm", roleCode: "COMPANY_ADMIN" as const },
  { key: "mario", name: "Mario Vivanco", email: "mario.vivanco@yc-telecomunicaciones.crm", roleCode: "SUPERVISOR" as const },
  { key: "dani", name: "Dani Molina", email: "dani.molina@yc-telecomunicaciones.crm", roleCode: "AGENT" as const, supervisorKey: "mario" as const },
];
// Platform-level account (tenantId=null) — never part of the YC tenant. Only used if no SUPER_ADMIN exists at
// all in this database; if one already exists (any email), it's reused as-is, never duplicated. Overridable via
// env vars so whoever runs this in the real container isn't stuck with these defaults.
const MASTER_ADMIN_EMAIL = process.env.MASTER_ADMIN_EMAIL || "concienciaexpansiva11@gmail.com";
const MASTER_ADMIN_NAME = process.env.MASTER_ADMIN_NAME || "Dany Molina";

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function redactedHost(url: string | undefined) {
  if (!url) return "(DATABASE_URL no configurada)";
  try { const u = new URL(url); return `${u.hostname}:${u.port || "5432"}${u.pathname}`; } catch { return "(DATABASE_URL no parseable)"; }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`=== setup-yc-production-access — modo ${apply ? "APLICAR (escribe cambios)" : "INSPECCIÓN (solo lectura)"} ===`);
  console.log("DB destino:", redactedHost(process.env.DATABASE_URL));

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  let tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  console.log(`TENANT_EXISTS = ${tenant ? "YES" : "NO"}`);

  const existingUsers = await Promise.all(USERS.map((u) => prisma.user.findUnique({ where: { email: u.email }, select: { id: true, tenantId: true, roleId: true, supervisorId: true, accessCode: true, role: { select: { code: true } } } })));
  for (let i = 0; i < USERS.length; i++) console.log(`${USERS[i].key.toUpperCase()}_EXISTS = ${existingUsers[i] ? "YES" : "NO"}`);

  // Platform SUPER_ADMIN: global role (tenantId=null), so any existing holder counts — never scoped to a
  // specific email, since the point is "is there already a platform admin", not "does this exact address exist".
  const superAdmins = await prisma.user.findMany({ where: { role: { code: "SUPER_ADMIN" } }, select: { id: true, name: true, email: true, status: true, accessCode: true }, orderBy: { createdAt: "asc" } });
  console.log(`SUPER_ADMIN_EXISTS = ${superAdmins.length ? "YES" : "NO"}`);
  if (superAdmins.length) console.log("SUPER_ADMIN_ACCOUNTS:", superAdmins.map((s) => s.email));
  if (superAdmins.length > 1) console.warn("Aviso: hay más de una cuenta SUPER_ADMIN — se reutiliza la más antigua, no se crea ni se elimina ninguna.");

  if (!apply) {
    console.log("\nModo inspección: no se escribió nada. Vuelve a ejecutar con --apply para crear lo que falte.");
    await prisma.$disconnect();
    return;
  }

  // Any existing user found under a DIFFERENT tenant than the one we're about to use is a real conflict —
  // stop rather than guess which one is "right".
  for (let i = 0; i < USERS.length; i++) {
    const existing = existingUsers[i];
    if (existing && tenant && existing.tenantId !== tenant.id) {
      throw new Error(`${USERS[i].email} ya existe pero pertenece a otro tenant (tenantId=${existing.tenantId}). Deteniendo — requiere decisión humana, no se modifica nada.`);
    }
  }

  if (!tenant) {
    console.log("\nTenant no existe — creándolo con la misma arquitectura ya validada (plan, plantilla vertical, módulos, roles).");
    const [plan, template, modules, permissions] = await Promise.all([
      prisma.plan.findFirst({ where: { code: PLAN_CODE, status: "ACTIVE" } }),
      prisma.verticalTemplate.findFirst({ where: { code: VERTICAL_TEMPLATE_CODE, active: true }, include: { features: true } }),
      prisma.module.findMany({ where: { status: "ACTIVE" } }),
      prisma.permission.findMany(),
    ]);
    if (!plan) throw new Error(`Plan "${PLAN_CODE}" no existe en esta base. No se inventa uno nuevo — deteniendo.`);
    if (!template) throw new Error(`Plantilla vertical "${VERTICAL_TEMPLATE_CODE}" no existe en esta base. No se inventa una nueva — deteniendo.`);
    const maxUsersDefinition = await prisma.limitDefinition.findUnique({ where: { code: "max-users" } });
    if (!maxUsersDefinition) throw new Error(`Definición de límite "max-users" no existe en esta base. Deteniendo.`);
    const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
    const missingModules = ENABLED_MODULE_CODES.filter((code) => !modules.some((m) => m.code === code));
    if (missingModules.length) console.warn("Aviso: módulos no encontrados en el catálogo, se omiten:", missingModules);
    const missingFeatures = CRM_FEATURE_CODES.filter((code) => !template.features.some((f) => f.code === code));
    if (missingFeatures.length) console.warn("Aviso: features CRM no encontradas en la plantilla, se omiten:", missingFeatures);

    tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: "YC Telecomunicaciones",
          slug: TENANT_SLUG,
          status: "ACTIVE",
          planId: plan.id,
          branding: { create: { displayName: "YC Telecomunicaciones", primaryColor: "#ff0000", secondaryColor: "#213745", subdomain: TENANT_SLUG } },
          modules: { create: modules.map((m) => ({ moduleId: m.id, enabled: ENABLED_MODULE_CODES.includes(m.code), activatedAt: ENABLED_MODULE_CODES.includes(m.code) ? new Date() : null })) },
          limitOverrides: { create: { limitId: maxUsersDefinition.id, value: BigInt(MAX_USERS) } },
          verticalTemplates: { create: { verticalTemplateId: template.id, active: true } },
          crmFeatures: { create: template.features.filter((f) => CRM_FEATURE_CODES.includes(f.code)).map((f) => ({ featureId: f.id, active: true })) },
        },
      });
      for (const roleCode of Object.keys(ROLE_PERMISSIONS)) {
        const permissionCodes = ROLE_PERMISSIONS[roleCode].filter((code) => permissionIdByCode.has(code));
        await tx.role.create({
          data: {
            code: roleCode, name: ROLE_NAMES[roleCode], tenantId: created.id, isSystem: true,
            permissions: { create: permissionCodes.map((code) => ({ permissionId: permissionIdByCode.get(code)! })) },
          },
        });
      }
      return created;
    });
    console.log("Tenant creado:", tenant.id);
  } else {
    console.log("\nTenant ya existe — reutilizando, verificando que los 3 roles existan.");
    const permissions = await prisma.permission.findMany();
    const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
    for (const roleCode of Object.keys(ROLE_PERMISSIONS)) {
      const existingRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, code: roleCode } });
      if (existingRole) { console.log(`Rol ${roleCode} ya existe — no se toca.`); continue; }
      const permissionCodes = ROLE_PERMISSIONS[roleCode].filter((code) => permissionIdByCode.has(code));
      await prisma.role.create({
        data: { code: roleCode, name: ROLE_NAMES[roleCode], tenantId: tenant.id, isSystem: true, permissions: { create: permissionCodes.map((code) => ({ permissionId: permissionIdByCode.get(code)! })) } },
      });
      console.log(`Rol ${roleCode} no existía — creado con el set de permisos de referencia.`);
    }
  }

  const roles = await prisma.role.findMany({ where: { tenantId: tenant.id, code: { in: Object.keys(ROLE_PERMISSIONS) } } });
  const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]));

  const results: Record<string, { name: string; email: string; roleCode: string; accessCode: string; password: string; wasNew: boolean }> = {};
  const userIdByKey = new Map<string, string>();

  for (const spec of USERS) {
    const existing = existingUsers[USERS.indexOf(spec)];
    const roleId = roleIdByCode.get(spec.roleCode);
    if (!roleId) throw new Error(`Rol ${spec.roleCode} no disponible para el tenant tras la verificación anterior. Deteniendo.`);
    const password = tempPassword();
    const passwordHash = await hash(password, 12);

    if (!existing) {
      const supervisorId = spec.supervisorKey ? userIdByKey.get(spec.supervisorKey) ?? null : null;
      const accessCode = await generateUniqueAccessCode();
      const created = await prisma.user.create({
        data: { name: spec.name, email: spec.email, passwordHash, tenantId: tenant.id, roleId, supervisorId, accessCode, mustChangePassword: true },
        select: { id: true, accessCode: true },
      });
      userIdByKey.set(spec.key, created.id);
      results[spec.key] = { name: spec.name, email: spec.email, roleCode: spec.roleCode, accessCode: created.accessCode!, password, wasNew: true };
      console.log(`${spec.name}: creado.`);
    } else {
      userIdByKey.set(spec.key, existing.id);
      const accessCode = existing.accessCode ?? await generateUniqueAccessCode();
      const desiredSupervisorId = spec.supervisorKey ? userIdByKey.get(spec.supervisorKey) ?? existing.supervisorId : existing.supervisorId;
      const roleFixNeeded = existing.role.code !== spec.roleCode;
      if (roleFixNeeded) console.log(`${spec.name}: rol existente era ${existing.role.code}, corrigiendo a ${spec.roleCode}.`);
      await prisma.user.update({
        where: { id: existing.id },
        data: { roleId, supervisorId: desiredSupervisorId, accessCode, passwordHash, mustChangePassword: true },
      });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      results[spec.key] = { name: spec.name, email: spec.email, roleCode: spec.roleCode, accessCode, password, wasNew: false };
      console.log(`${spec.name}: ya existía — reutilizado (contraseña reseteada, mustChangePassword=true).`);
    }
  }

  // Dani.supervisorId = Mario.id, explícito y final, por si Mario fue creado después de Dani en este mismo run.
  const marioId = userIdByKey.get("mario");
  const daniId = userIdByKey.get("dani");
  if (marioId && daniId) await prisma.user.update({ where: { id: daniId }, data: { supervisorId: marioId } });

  // Platform SUPER_ADMIN — never touches the YC tenant or its role table (tenantId=null, global role).
  const superAdminRole = await prisma.role.findFirst({ where: { code: "SUPER_ADMIN", tenantId: null } });
  if (!superAdminRole) throw new Error('Rol global "SUPER_ADMIN" (tenantId=null) no existe en esta base. No se inventa — deteniendo.');
  const masterPassword = tempPassword();
  const masterPasswordHash = await hash(masterPassword, 12);
  let masterAdmin: { id: string; name: string; email: string; wasNew: boolean };
  if (superAdmins.length) {
    const reused = superAdmins[0];
    await prisma.user.update({ where: { id: reused.id }, data: { passwordHash: masterPasswordHash, mustChangePassword: true, status: "ACTIVE" } });
    await prisma.session.deleteMany({ where: { userId: reused.id } });
    masterAdmin = { id: reused.id, name: reused.name, email: reused.email, wasNew: false };
    console.log(`SUPER_ADMIN: ya existía (${reused.email}) — reutilizado, contraseña reseteada.`);
  } else {
    const created = await prisma.user.create({
      data: { name: MASTER_ADMIN_NAME, email: MASTER_ADMIN_EMAIL, passwordHash: masterPasswordHash, tenantId: null, roleId: superAdminRole.id, status: "ACTIVE", mustChangePassword: true },
      select: { id: true, name: true, email: true },
    });
    masterAdmin = { ...created, wasNew: true };
    console.log(`SUPER_ADMIN: no existía — creado (${created.email}).`);
  }

  console.log("\n=== RESULTADO ===");
  console.log(JSON.stringify({ tenantId: tenant.id, tenantSlug: tenant.slug, users: results, masterAdmin: { ...masterAdmin, password: masterPassword } }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
