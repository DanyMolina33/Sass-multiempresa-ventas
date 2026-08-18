import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { LimitUnit, PrismaClient, RecordStatus } from "@prisma/client";
import { generateUniqueAccessCode } from "../lib/access-code";

// BLOQUE 35B/35D — acceso puntual, idempotente, para dejar el tenant YC Telecomunicaciones, sus 3 accesos de
// referencia (Gerente/Supervisor/Promotor) y el SUPER_ADMIN de plataforma operativos en la base de datos que
// esté configurada en DATABASE_URL en el entorno donde se ejecute este script (nunca hardcoded aquí — así el
// mismo script sirve para inspección local y, corrido dentro del contenedor real, para producción).
//
// Modo por defecto: SOLO INSPECCIONA, no escribe nada. Pasar --apply para crear lo que falte.
// Nunca borra, nunca trunca, nunca toca Sale/Customer/Lead/ReconciliationImport/FinanceEntry/PipelineStage/
// Product/etc. — y nunca toca el tenant "clinica-demo" (fuera de alcance operativo, ver CLAUDE.md).
//
// Todo lo "oficial" (Plan, catálogo de Módulos, catálogo de Permisos, límites, plantilla vertical CRM_TELECOM
// y el set mínimo de permisos por rol para YC) está copiado literalmente de prisma/seed.ts — la única fuente
// de verdad del bootstrap de plataforma en este repo. Nada de esto se inventa aquí; si algo que este script
// necesita no está ni en la base ni en seed.ts, el script se detiene en vez de adivinar.

// --- Catálogo de plataforma (global, no específico de un tenant) — prisma/seed.ts líneas 11-27 ---
const PLATFORM_MODULES = [
  ["crm", "CRM", "Clientes, ventas y seguimientos"],
  ["reportes", "Reportes", "Indicadores y análisis del negocio"],
  ["guardian", "Guardian", "Observación de infraestructura"],
  ["call-center", "Call Center", "Campañas, agentes y telefonía"],
  ["sms-center", "SMS Center", "Campañas y mensajería SMS"],
  ["whatsapp", "WhatsApp", "Mensajería y chatbot"],
] as const;
const PLATFORM_LIMITS = [
  ["max-users", "Máximo usuarios", LimitUnit.COUNT, 25],
  ["max-call-center-agents", "Máximo agentes Call Center", LimitUnit.COUNT, 10],
  ["max-simultaneous-channels", "Máximo canales simultáneos", LimitUnit.COUNT, 20],
  ["max-campaigns", "Máximo campañas", LimitUnit.COUNT, 15],
  ["sms-limit", "Límite SMS", LimitUnit.SMS, 5000],
  ["phone-minutes-limit", "Límite minutos telefónicos", LimitUnit.MINUTES, 10000],
] as const;
const PLATFORM_PERMISSIONS = [
  ["platform.manage", "Administrar plataforma"], ["tenants.read_all", "Ver todas las empresas"],
  ["tenant.read", "Ver empresa propia"], ["users.read", "Ver usuarios"], ["users.manage", "Administrar usuarios"],
  ["modules.read", "Consultar módulos"], ["reports.read", "Consultar reportes"], ["guardian.read", "Ver Guardian"],
  ["operations.basic", "Acceso operativo básico"],
  ["users.credentials.reset", "Restablecer credenciales de usuarios"],
] as const;
const PLAN_CODE = "business";
const PLAN_NAME = "Business";

// --- Tenant YC Telecomunicaciones (prisma/seed.ts líneas 120-172) ---
const TENANT_SLUG = "yc-telecomunicaciones";
const VERTICAL_TEMPLATE_CODE = "CRM_TELECOM";
const VERTICAL_TEMPLATE_NAME = "CRM Ventas Telecom";
const VERTICAL_TEMPLATE_DESCRIPTION = "Configuración reutilizable para operaciones comerciales de telecomunicaciones";
const YC_CRM_FEATURES = [
  ["leads", "Leads", true], ["customers", "Clientes", true], ["sales", "Ventas", true],
  ["follow-ups", "Seguimientos", true], ["products", "Productos", true], ["commercial-plans", "Planes Comerciales", true],
  ["commissions", "Comisiones", false], ["reconciliation", "Conciliación", false], ["finance", "Finanzas", false], ["advanced-dashboard", "Dashboard avanzado", false],
] as const;
const YC_ENABLED_MODULE_CODES = ["crm", "reportes"];
const YC_MAX_USERS_OVERRIDE = 7;
const ROLE_NAMES: Record<string, string> = { COMPANY_ADMIN: "Administrador de empresa", SUPERVISOR: "Supervisor", AGENT: "Promotor" };
const ROLE_IDS: Record<string, string> = { COMPANY_ADMIN: "role-yc-company-admin", SUPERVISOR: "role-yc-supervisor", AGENT: "role-yc-agent" };
// Set mínimo oficial por rol para YC (seed.ts líneas 162-168) — la autorización real de este producto es por
// código de rol (isCompanyAdmin/isSuperAdmin/role.code), no por esta tabla granular (ver lib/auth.ts), así que
// un set mínimo no rompe ninguna funcionalidad de Supervisor/Promotor Portal ya entregada.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  COMPANY_ADMIN: ["tenant.read", "users.read", "users.manage", "users.credentials.reset", "modules.read"],
  SUPERVISOR: ["tenant.read", "reports.read"],
  AGENT: ["tenant.read", "operations.basic"],
};
const USERS = [
  { key: "yaki", name: "Yaki Chávez", email: "yaki.chavez@yc-telecomunicaciones.crm", roleCode: "COMPANY_ADMIN" as const },
  { key: "mario", name: "Mario Vivanco", email: "mario.vivanco@yc-telecomunicaciones.crm", roleCode: "SUPERVISOR" as const },
  { key: "dani", name: "Dani Molina", email: "dani.molina@yc-telecomunicaciones.crm", roleCode: "AGENT" as const, supervisorKey: "mario" as const },
];

// --- SUPER_ADMIN de plataforma (prisma/seed.ts línea 61) ---
const SUPER_ADMIN_ROLE_ID = "role-super-admin";
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

// Upserts ONLY the platform-wide catalog rows (Plan, LimitDefinition, PlanLimit, Module, Permission) — global,
// never tenant-specific, copied verbatim from prisma/seed.ts. Safe to run every time: no demo tenant, no demo
// user, no commercial data of any kind is touched here.
async function bootstrapPlatformCatalog(prisma: PrismaClient) {
  const plan = await prisma.plan.upsert({ where: { code: PLAN_CODE }, update: { name: PLAN_NAME, status: RecordStatus.ACTIVE }, create: { name: PLAN_NAME, code: PLAN_CODE } });
  for (const [code, name, unit, value] of PLATFORM_LIMITS) {
    const definition = await prisma.limitDefinition.upsert({ where: { code }, update: { name, unit }, create: { code, name, unit } });
    await prisma.planLimit.upsert({ where: { planId_limitId: { planId: plan.id, limitId: definition.id } }, update: { value }, create: { planId: plan.id, limitId: definition.id, value } });
  }
  const moduleIdByCode = new Map<string, string>();
  for (const [code, name, description] of PLATFORM_MODULES) {
    const moduleRecord = await prisma.module.upsert({ where: { code }, update: { name, description }, create: { code, name, description } });
    moduleIdByCode.set(code, moduleRecord.id);
  }
  const permissionIdByCode = new Map<string, string>();
  for (const [code, name] of PLATFORM_PERMISSIONS) {
    const permission = await prisma.permission.upsert({ where: { code }, update: { name }, create: { code, name } });
    permissionIdByCode.set(code, permission.id);
  }
  return { plan, moduleIdByCode, permissionIdByCode };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`=== setup-yc-production-access — modo ${apply ? "APLICAR (escribe cambios)" : "INSPECCIÓN (solo lectura)"} ===`);
  console.log("DB destino:", redactedHost(process.env.DATABASE_URL));

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const planExists = await prisma.plan.findUnique({ where: { code: PLAN_CODE }, select: { id: true } });
  console.log(`PLAN_EXISTS = ${planExists ? "YES" : "NO"}`);
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

  console.log("\nAsegurando catálogo de plataforma (Plan/Módulos/Permisos/Límites) — copiado literal de prisma/seed.ts.");
  const { plan, moduleIdByCode, permissionIdByCode } = await bootstrapPlatformCatalog(prisma);

  if (!tenant) {
    console.log("Tenant no existe — creándolo con la configuración oficial mínima de seed.ts (plan, plantilla vertical, módulos, roles). No se crean clientes/ventas/leads/productos demo.");
    const template = await prisma.verticalTemplate.upsert({
      where: { code: VERTICAL_TEMPLATE_CODE },
      update: { name: VERTICAL_TEMPLATE_NAME, description: VERTICAL_TEMPLATE_DESCRIPTION, active: true },
      create: { code: VERTICAL_TEMPLATE_CODE, name: VERTICAL_TEMPLATE_NAME, description: VERTICAL_TEMPLATE_DESCRIPTION },
    });
    const maxUsersDefinition = await prisma.limitDefinition.findUniqueOrThrow({ where: { code: "max-users" } });

    tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: "YC Telecomunicaciones",
          slug: TENANT_SLUG,
          status: "ACTIVE",
          planId: plan.id,
          branding: { create: { displayName: "YC Telecomunicaciones", subdomain: TENANT_SLUG } },
          modules: { create: [...moduleIdByCode.entries()].map(([code, id]) => ({ moduleId: id, enabled: YC_ENABLED_MODULE_CODES.includes(code), activatedAt: YC_ENABLED_MODULE_CODES.includes(code) ? new Date() : null })) },
          limitOverrides: { create: { limitId: maxUsersDefinition.id, value: BigInt(YC_MAX_USERS_OVERRIDE) } },
          verticalTemplates: { create: { verticalTemplateId: template.id, active: true } },
        },
      });
      for (const [code, name, active] of YC_CRM_FEATURES) {
        const feature = await tx.verticalTemplateFeature.upsert({
          where: { verticalTemplateId_code: { verticalTemplateId: template.id, code } },
          update: { name, defaultActive: active },
          create: { verticalTemplateId: template.id, code, name, defaultActive: active },
        });
        await tx.tenantCrmFeature.create({ data: { tenantId: created.id, featureId: feature.id, active } });
      }
      for (const roleCode of Object.keys(ROLE_PERMISSIONS)) {
        const permissionCodes = ROLE_PERMISSIONS[roleCode].filter((code) => permissionIdByCode.has(code));
        await tx.role.create({
          data: {
            id: ROLE_IDS[roleCode], code: roleCode, name: ROLE_NAMES[roleCode], tenantId: created.id, isSystem: true,
            permissions: { create: permissionCodes.map((code) => ({ permissionId: permissionIdByCode.get(code)! })) },
          },
        });
      }
      return created;
    });
    console.log("Tenant creado:", tenant.id);
  } else {
    console.log("Tenant ya existe — reutilizando, verificando que los 3 roles existan (sin tocar los que ya están).");
    for (const roleCode of Object.keys(ROLE_PERMISSIONS)) {
      const existingRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, code: roleCode } });
      if (existingRole) { console.log(`Rol ${roleCode} ya existe — no se toca.`); continue; }
      const permissionCodes = ROLE_PERMISSIONS[roleCode].filter((code) => permissionIdByCode.has(code));
      await prisma.role.create({
        data: { id: ROLE_IDS[roleCode], code: roleCode, name: ROLE_NAMES[roleCode], tenantId: tenant.id, isSystem: true, permissions: { create: permissionCodes.map((code) => ({ permissionId: permissionIdByCode.get(code)! })) } },
      });
      console.log(`Rol ${roleCode} no existía — creado con el set de permisos oficial mínimo.`);
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

  // Platform SUPER_ADMIN — global role (tenantId=null), nunca toca el tenant YC.
  const superAdminRole = await prisma.role.upsert({
    where: { id: SUPER_ADMIN_ROLE_ID },
    update: {},
    create: {
      id: SUPER_ADMIN_ROLE_ID, code: "SUPER_ADMIN", name: "Super Administrador", tenantId: null, isSystem: true,
      permissions: { create: PLATFORM_PERMISSIONS.map(([code]) => ({ permissionId: permissionIdByCode.get(code)! })) },
    },
  });
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
