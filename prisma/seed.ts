import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LimitUnit, RecordStatus, TenantStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { YC_PRODUCT_CATALOG } from "../lib/telecom-normalization";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada. No se puede ejecutar el seed.");
if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD no está configurada. No se crearán usuarios demo sin una clave explícita.");
const demoPassword = process.env.DEMO_PASSWORD;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const modules = [
  ["crm", "CRM", "Clientes, ventas y seguimientos"],
  ["reportes", "Reportes", "Indicadores y análisis del negocio"],
  ["guardian", "Guardian", "Observación de infraestructura"],
  ["call-center", "Call Center", "Campañas, agentes y telefonía"],
  ["sms-center", "SMS Center", "Campañas y mensajería SMS"],
  ["whatsapp", "WhatsApp", "Mensajería y chatbot"],
] as const;

const limits = [
  ["max-users", "Máximo usuarios", LimitUnit.COUNT, 25],
  ["max-call-center-agents", "Máximo agentes Call Center", LimitUnit.COUNT, 10],
  ["max-simultaneous-channels", "Máximo canales simultáneos", LimitUnit.COUNT, 20],
  ["max-campaigns", "Máximo campañas", LimitUnit.COUNT, 15],
  ["sms-limit", "Límite SMS", LimitUnit.SMS, 5000],
  ["phone-minutes-limit", "Límite minutos telefónicos", LimitUnit.MINUTES, 10000],
] as const;

async function main() {
  const plan = await prisma.plan.upsert({ where: { code: "business" }, update: { name: "Business", status: RecordStatus.ACTIVE }, create: { name: "Business", code: "business" } });
  for (const [code, name, unit, value] of limits) {
    const definition = await prisma.limitDefinition.upsert({ where: { code }, update: { name, unit }, create: { code, name, unit } });
    await prisma.planLimit.upsert({ where: { planId_limitId: { planId: plan.id, limitId: definition.id } }, update: { value }, create: { planId: plan.id, limitId: definition.id, value } });
  }
  const savedModules = new Map<string, string>();
  for (const [code, name, description] of modules) {
    const moduleRecord = await prisma.module.upsert({ where: { code }, update: { name, description }, create: { code, name, description } });
    savedModules.set(code, moduleRecord.id);
  }
  const tenant = await prisma.tenant.upsert({ where: { slug: "clinica-demo" }, update: { name: "Clínica Demo", status: TenantStatus.ACTIVE, planId: plan.id }, create: { name: "Clínica Demo", slug: "clinica-demo", status: TenantStatus.ACTIVE, planId: plan.id } });
  for (const [code] of modules) {
    const enabled = ["crm", "reportes", "guardian"].includes(code);
    await prisma.tenantModule.upsert({ where: { tenantId_moduleId: { tenantId: tenant.id, moduleId: savedModules.get(code)! } }, update: { enabled, activatedAt: enabled ? new Date() : null }, create: { tenantId: tenant.id, moduleId: savedModules.get(code)!, enabled, activatedAt: enabled ? new Date() : null } });
  }

  const permissions = [
    ["platform.manage", "Administrar plataforma"], ["tenants.read_all", "Ver todas las empresas"],
    ["tenant.read", "Ver empresa propia"], ["users.read", "Ver usuarios"], ["users.manage", "Administrar usuarios"],
    ["modules.read", "Consultar módulos"], ["reports.read", "Consultar reportes"], ["guardian.read", "Ver Guardian"],
    ["operations.basic", "Acceso operativo básico"],
    // Section 65 of the Supervisor Portal block: credential operations (reset password / regenerate access link)
    // are COMPANY_ADMIN-only — a narrower permission than the general users.manage, never granted to SUPERVISOR.
    ["users.credentials.reset", "Restablecer credenciales de usuarios"],
  ] as const;
  const permissionIds = new Map<string, string>();
  for (const [code, name] of permissions) {
    const permission = await prisma.permission.upsert({ where: { code }, update: { name }, create: { code, name } });
    permissionIds.set(code, permission.id);
  }
  const roles = [
    { id: "role-super-admin", code: "SUPER_ADMIN", name: "Super Administrador", tenantId: null, permissions: permissions.map(([code]) => code) },
    { id: "role-clinic-company-admin", code: "COMPANY_ADMIN", name: "Administrador de empresa", tenantId: tenant.id, permissions: ["tenant.read", "users.read", "users.manage", "modules.read"] },
    { id: "role-clinic-supervisor", code: "SUPERVISOR", name: "Supervisor", tenantId: tenant.id, permissions: ["tenant.read", "users.read", "reports.read"] },
    { id: "role-clinic-agent", code: "AGENT", name: "Agente", tenantId: tenant.id, permissions: ["tenant.read", "operations.basic"] },
  ];
  for (const roleData of roles) {
    await prisma.role.upsert({ where: { id: roleData.id }, update: { code: roleData.code, name: roleData.name, tenantId: roleData.tenantId, isSystem: true }, create: { id: roleData.id, code: roleData.code, name: roleData.name, tenantId: roleData.tenantId, isSystem: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: roleData.id } });
    await prisma.rolePermission.createMany({ data: roleData.permissions.map((code) => ({ roleId: roleData.id, permissionId: permissionIds.get(code)! })) });
  }
  const passwordHash = await hash(demoPassword, 12);
  const demoUsers = [
    { name: "Super Admin Demo", email: "superadmin@mentorify.test", tenantId: null, roleId: "role-super-admin" },
    { name: "Admin Clínica Demo", email: "admin@clinicademo.test", tenantId: tenant.id, roleId: "role-clinic-company-admin" },
    { name: "Supervisor Clínica Demo", email: "supervisor@clinicademo.test", tenantId: tenant.id, roleId: "role-clinic-supervisor" },
    { name: "Agente Clínica Demo", email: "agente@clinicademo.test", tenantId: tenant.id, roleId: "role-clinic-agent" },
  ];
  for (const user of demoUsers) await prisma.user.upsert({ where: { email: user.email }, update: { ...user, passwordHash, status: "ACTIVE" }, create: { ...user, passwordHash } });

  const supervisor = await prisma.user.findUniqueOrThrow({ where: { email: "supervisor@clinicademo.test" } });
  const agentOne = await prisma.user.findUniqueOrThrow({ where: { email: "agente@clinicademo.test" } });
  await prisma.user.update({ where: { id: agentOne.id }, data: { supervisorId: supervisor.id } });
  const agentTwo = await prisma.user.upsert({ where: { email: "promotor2@clinicademo.test" }, update: { name: "Promotor Dos", tenantId: tenant.id, roleId: "role-clinic-agent", supervisorId: supervisor.id, passwordHash, status: "ACTIVE" }, create: { name: "Promotor Dos", email: "promotor2@clinicademo.test", tenantId: tenant.id, roleId: "role-clinic-agent", supervisorId: supervisor.id, passwordHash } });

  const stageData = [
    ["NUEVO", "Nuevo", "#6957d5"], ["ASIGNADO", "Asignado", "#5577d5"], ["CONTACTADO", "Contactado", "#3386b7"],
    ["INTERESADO", "Interesado", "#1e9b69"], ["DOCUMENTOS_PENDIENTES", "Documentos pendientes", "#d88917"],
    ["VENTA_REGISTRADA", "Venta registrada", "#7657b8"], ["EN_VALIDACION", "En validación", "#b16d24"],
    ["APROBADA", "Aprobada", "#248d62"], ["ACTIVADA", "Activada", "#157a51"], ["RECHAZADA", "Rechazada", "#d14d5c"],
    ["CANCELADA", "Cancelada", "#8d5360"], ["NO_INTERESADO", "No interesado", "#787d8d"], ["NO_CONTACTABLE", "No contactable", "#555b6e"],
  ] as const;
  const stages = new Map<string, string>();
  for (const [index, [code, name, color]] of stageData.entries()) {
    const stage = await prisma.pipelineStage.upsert({ where: { tenantId_code: { tenantId: tenant.id, code } }, update: { name, order: index + 1, color }, create: { tenantId: tenant.id, code, name, order: index + 1, color } });
    stages.set(code, stage.id);
  }
  const internet = await prisma.product.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "FIBRA" } }, update: { name: "Internet Fibra", category: "Internet" }, create: { tenantId: tenant.id, code: "FIBRA", name: "Internet Fibra", category: "Internet" } });
  const mobile = await prisma.product.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "MOVIL" } }, update: { name: "Línea Móvil", category: "Móvil" }, create: { tenantId: tenant.id, code: "MOVIL", name: "Línea Móvil", category: "Móvil" } });
  await prisma.commercialPlan.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "FIBRA-500" } }, update: { productId: internet.id, name: "Fibra 500 Mbps", price: 89.90, fixedCharge: 89.90 }, create: { tenantId: tenant.id, productId: internet.id, code: "FIBRA-500", name: "Fibra 500 Mbps", price: 89.90, fixedCharge: 89.90 } });
  await prisma.commercialPlan.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "MOVIL-ILIMITADO" } }, update: { productId: mobile.id, name: "Móvil Ilimitado", price: 49.90, fixedCharge: 49.90 }, create: { tenantId: tenant.id, productId: mobile.id, code: "MOVIL-ILIMITADO", name: "Móvil Ilimitado", price: 49.90, fixedCharge: 49.90 } });
  const leadOne = await prisma.lead.upsert({ where: { id: "lead-demo-maria" }, update: { tenantId: tenant.id, pipelineStageId: stages.get("CONTACTADO")!, assignedUserId: agentOne.id, supervisorId: supervisor.id }, create: { id: "lead-demo-maria", tenantId: tenant.id, name: "María Torres", phone: "+51 999 100 201", email: "maria@example.test", origin: "Campaña digital", pipelineStageId: stages.get("CONTACTADO")!, assignedUserId: agentOne.id, supervisorId: supervisor.id, notes: "Interesada en fibra hogar" } });
  const leadTwo = await prisma.lead.upsert({ where: { id: "lead-demo-carlos" }, update: { tenantId: tenant.id, pipelineStageId: stages.get("INTERESADO")!, assignedUserId: agentTwo.id, supervisorId: supervisor.id }, create: { id: "lead-demo-carlos", tenantId: tenant.id, name: "Carlos Vega", phone: "+51 999 100 202", origin: "Referido", pipelineStageId: stages.get("INTERESADO")!, assignedUserId: agentTwo.id, supervisorId: supervisor.id } });
  const customer = await prisma.customer.upsert({ where: { id: "customer-demo-ana" }, update: { tenantId: tenant.id, ownerUserId: agentOne.id }, create: { id: "customer-demo-ana", tenantId: tenant.id, name: "Ana Ramírez", document: "70000001", phone: "+51 999 200 301", email: "ana@example.test", city: "Lima", address: "Av. Central 123", ownerUserId: agentOne.id } });
  await prisma.customer.upsert({ where: { id: "customer-demo-luis" }, update: { tenantId: tenant.id, ownerUserId: agentTwo.id }, create: { id: "customer-demo-luis", tenantId: tenant.id, name: "Luis Mendoza", document: "70000002", phone: "+51 999 200 302", email: "luis@example.test", city: "Callao", ownerUserId: agentTwo.id } });
  await prisma.followUp.upsert({ where: { id: "followup-demo-lead" }, update: { tenantId: tenant.id, leadId: leadOne.id, assignedUserId: agentOne.id }, create: { id: "followup-demo-lead", tenantId: tenant.id, leadId: leadOne.id, assignedUserId: agentOne.id, scheduledAt: new Date(Date.now() + 86400000), type: "Llamada", notes: "Confirmar cobertura" } });
  await prisma.followUp.upsert({ where: { id: "followup-demo-customer" }, update: { tenantId: tenant.id, customerId: customer.id, assignedUserId: agentOne.id }, create: { id: "followup-demo-customer", tenantId: tenant.id, customerId: customer.id, assignedUserId: agentOne.id, scheduledAt: new Date(Date.now() + 172800000), type: "Visita", notes: "Revisar instalación" } });
  for (const [lead, stageCode, userId] of [[leadOne, "CONTACTADO", agentOne.id], [leadTwo, "INTERESADO", agentTwo.id]] as const) await prisma.leadStageHistory.upsert({ where: { id: `history-${lead.id}` }, update: { tenantId: tenant.id, pipelineStageId: stages.get(stageCode)!, changedByUserId: userId }, create: { id: `history-${lead.id}`, tenantId: tenant.id, leadId: lead.id, pipelineStageId: stages.get(stageCode)!, changedByUserId: userId } });
  const fiberPlan = await prisma.commercialPlan.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: "FIBRA-500" } } });
  const mobilePlan = await prisma.commercialPlan.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: "MOVIL-ILIMITADO" } } });
  const customerTwo = await prisma.customer.findUniqueOrThrow({ where: { id: "customer-demo-luis" } });
  const sales = [
    { id: "sale-demo-registered", leadId: leadOne.id, customer, product: internet, plan: fiberPlan, agent: agentOne, status: "REGISTRADA" as const, type: "INTERNET_FIJO" as const, sec: "SEC-10001", sot: "SOT-20001", msisdn: null },
    { id: "sale-demo-approved", leadId: leadTwo.id, customer: customerTwo, product: mobile, plan: mobilePlan, agent: agentTwo, status: "APROBADA" as const, type: "PORTABILIDAD_POSTPAGO" as const, sec: "SEC-10002", sot: null, msisdn: "51999100202" },
    { id: "sale-demo-active", leadId: null, customer, product: mobile, plan: mobilePlan, agent: agentOne, status: "ACTIVADA" as const, type: "ALTA_NUEVA_POSTPAGO" as const, sec: "SEC-10003", sot: null, msisdn: "51999200301" },
  ];
  for (const saleData of sales) {
    await prisma.sale.upsert({ where: { id: saleData.id }, update: { tenantId: tenant.id, status: saleData.status, agentId: saleData.agent.id, supervisorId: supervisor.id }, create: { id: saleData.id, tenantId: tenant.id, leadId: saleData.leadId, customerId: saleData.customer.id, productId: saleData.product.id, commercialPlanId: saleData.plan.id, agentId: saleData.agent.id, supervisorId: supervisor.id, transactionType: saleData.type, status: saleData.status, sec: saleData.sec, sot: saleData.sot, msisdn: saleData.msisdn, customerDocumentSnapshot: saleData.customer.document, customerNameSnapshot: saleData.customer.name, productNameSnapshot: saleData.product.name, planNameSnapshot: saleData.plan.name, fixedChargeSnapshot: saleData.plan.fixedCharge, saleAmount: saleData.plan.price, salesChannel: "Presencial", pointOfSale: "Demo Lima", source: "Seed local", createdByUserId: saleData.agent.id, approvalDate: saleData.status === "APROBADA" ? new Date() : null, activationDate: saleData.status === "ACTIVADA" ? new Date() : null } });
    await prisma.saleStatusHistory.upsert({ where: { id: `sale-history-${saleData.id}` }, update: { newStatus: saleData.status, changedByUserId: saleData.agent.id }, create: { id: `sale-history-${saleData.id}`, tenantId: tenant.id, saleId: saleData.id, newStatus: saleData.status, changedByUserId: saleData.agent.id, reason: "Estado demo inicial" } });
  }
  const ycTenant = await prisma.tenant.upsert({
    where: { slug: "yc-telecomunicaciones" },
    update: { name: "YC Telecomunicaciones", status: TenantStatus.ACTIVE, planId: plan.id },
    create: { name: "YC Telecomunicaciones", slug: "yc-telecomunicaciones", status: TenantStatus.ACTIVE, planId: plan.id },
  });
  await prisma.tenantBranding.upsert({
    where: { tenantId: ycTenant.id },
    update: { displayName: "YC Telecomunicaciones", subdomain: "yc-telecomunicaciones" },
    create: { tenantId: ycTenant.id, displayName: "YC Telecomunicaciones", subdomain: "yc-telecomunicaciones" },
  });
  const telecomTemplate = await prisma.verticalTemplate.upsert({
    where: { code: "CRM_TELECOM" },
    update: { name: "CRM Ventas Telecom", description: "Configuración reutilizable para operaciones comerciales de telecomunicaciones", active: true },
    create: { code: "CRM_TELECOM", name: "CRM Ventas Telecom", description: "Configuración reutilizable para operaciones comerciales de telecomunicaciones" },
  });
  await prisma.tenantVerticalTemplate.upsert({
    where: { tenantId_verticalTemplateId: { tenantId: ycTenant.id, verticalTemplateId: telecomTemplate.id } },
    update: { active: true },
    create: { tenantId: ycTenant.id, verticalTemplateId: telecomTemplate.id, active: true },
  });
  const crmFeatureData = [
    ["leads", "Leads", true], ["customers", "Clientes", true], ["sales", "Ventas", true],
    ["follow-ups", "Seguimientos", true], ["products", "Productos", true], ["commercial-plans", "Planes Comerciales", true],
    ["commissions", "Comisiones", false], ["reconciliation", "Conciliación", false], ["finance", "Finanzas", false], ["advanced-dashboard", "Dashboard avanzado", false],
  ] as const;
  for (const [code, name, active] of crmFeatureData) {
    const feature = await prisma.verticalTemplateFeature.upsert({
      where: { verticalTemplateId_code: { verticalTemplateId: telecomTemplate.id, code } },
      update: { name, defaultActive: active }, create: { verticalTemplateId: telecomTemplate.id, code, name, defaultActive: active },
    });
    await prisma.tenantCrmFeature.upsert({ where: { tenantId_featureId: { tenantId: ycTenant.id, featureId: feature.id } }, update: { active }, create: { tenantId: ycTenant.id, featureId: feature.id, active } });
  }
  const maxUsersDefinition = await prisma.limitDefinition.findUniqueOrThrow({ where: { code: "max-users" } });
  await prisma.tenantLimitOverride.upsert({ where: { tenantId_limitId: { tenantId: ycTenant.id, limitId: maxUsersDefinition.id } }, update: { value: 7 }, create: { tenantId: ycTenant.id, limitId: maxUsersDefinition.id, value: 7 } });
  for (const [code] of modules) {
    const enabled = ["crm", "reportes"].includes(code);
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: ycTenant.id, moduleId: savedModules.get(code)! } },
      update: { enabled, activatedAt: enabled ? new Date() : null },
      create: { tenantId: ycTenant.id, moduleId: savedModules.get(code)!, enabled, activatedAt: enabled ? new Date() : null },
    });
  }
  const ycRoles = [
    { id: "role-yc-company-admin", code: "COMPANY_ADMIN", name: "Administrador de empresa", permissions: ["tenant.read", "users.read", "users.manage", "users.credentials.reset", "modules.read"] },
    // SUPERVISOR never gets users.read/users.manage (section 9/65) — user/credential/module-grant administration
    // is COMPANY_ADMIN-only. Fixed here after finding this role had drifted to include them in the live DB.
    { id: "role-yc-supervisor", code: "SUPERVISOR", name: "Supervisor", permissions: ["tenant.read", "reports.read"] },
    { id: "role-yc-agent", code: "AGENT", name: "Promotor", permissions: ["tenant.read", "operations.basic"] },
  ];
  for (const roleData of ycRoles) {
    await prisma.role.upsert({ where: { id: roleData.id }, update: { code: roleData.code, name: roleData.name, tenantId: ycTenant.id, isSystem: true }, create: { id: roleData.id, code: roleData.code, name: roleData.name, tenantId: ycTenant.id, isSystem: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: roleData.id } });
    await prisma.rolePermission.createMany({ data: roleData.permissions.map((code) => ({ roleId: roleData.id, permissionId: permissionIds.get(code)! })) });
  }
  const ycUsers = [
    { name: "Admin YC Telecomunicaciones", email: "admin@yctelecom.test", roleId: "role-yc-company-admin" },
    { name: "Supervisor YC Telecomunicaciones", email: "supervisor@yctelecom.test", roleId: "role-yc-supervisor" },
    { name: "Promotor Uno YC", email: "promotor1@yctelecom.test", roleId: "role-yc-agent" },
    { name: "Promotor Dos YC", email: "promotor2@yctelecom.test", roleId: "role-yc-agent" },
  ];
  for (const user of ycUsers) await prisma.user.upsert({ where: { email: user.email }, update: { ...user, tenantId: ycTenant.id, passwordHash, status: "ACTIVE", supervisorId: null }, create: { ...user, tenantId: ycTenant.id, passwordHash } });
  const ycSupervisor = await prisma.user.findUniqueOrThrow({ where: { email: "supervisor@yctelecom.test" } });
  await prisma.user.updateMany({ where: { email: { in: ["promotor1@yctelecom.test", "promotor2@yctelecom.test"] } }, data: { supervisorId: ycSupervisor.id } });
  for (const [index, [code, name, color]] of stageData.entries()) {
    await prisma.pipelineStage.upsert({ where: { tenantId_code: { tenantId: ycTenant.id, code } }, update: { name, order: index + 1, color, status: RecordStatus.ACTIVE }, create: { tenantId: ycTenant.id, code, name, order: index + 1, color } });
  }
  for (const product of YC_PRODUCT_CATALOG) {
    await prisma.product.upsert({
      where: { tenantId_code: { tenantId: ycTenant.id, code: product.code } },
      update: { name: product.name, category: product.category },
      create: { tenantId: ycTenant.id, ...product },
    });
  }
  console.log(`Seed completado: ${tenant.name} (${tenant.slug}) y ${ycTenant.name} (${ycTenant.slug}, ${ycTenant.id})`);
}

main().finally(() => prisma.$disconnect());
