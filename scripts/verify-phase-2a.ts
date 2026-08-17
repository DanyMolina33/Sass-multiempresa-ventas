import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.APP_URL ?? "http://localhost:3001";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD no está configurada.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let authCookie = "";

type ApiModule = { moduleId: string; enabled: boolean; module: { code: string; name: string } };
type ApiTenant = { id: string; name: string; slug: string; plan: { id: string; name: string; limits: unknown[] }; modules: ApiModule[] };

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), cookie: authCookie } });
  const body = await response.json();
  assert.ok(response.ok, `${init?.method ?? "GET"} ${path} falló (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  let qaTenantId: string | undefined;
  let clinicId: string | undefined;
  let callCenterModuleId: string | undefined;
  let originalCallCenterState = false;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "superadmin@mentorify.test", password: process.env.DEMO_PASSWORD }) });
    assert.equal(login.status, 200, "El Super Admin demo no pudo iniciar sesión.");
    authCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    assert.ok(authCookie, "El login no entregó cookie de sesión.");
    const firstRead = await jsonRequest("/api/core/tenants") as { tenants: ApiTenant[] };
    const clinic = firstRead.tenants.find((tenant) => tenant.slug === "clinica-demo");
    assert.ok(clinic, "Clínica Demo no fue devuelta por la API.");
    clinicId = clinic.id;
    assert.equal(clinic.plan.name, "Business");
    assert.equal(clinic.plan.limits.length, 6);
    assert.equal(clinic.modules.length, 6);
    const expected = new Map([["crm", true], ["reportes", true], ["guardian", true], ["call-center", false], ["sms-center", false], ["whatsapp", false]]);
    for (const item of clinic.modules) assert.equal(item.enabled, expected.get(item.module.code), `Estado incorrecto: ${item.module.code}`);

    const plansRead = await jsonRequest("/api/core/plans") as { plans: Array<{ id: string; name: string; limits: unknown[] }> };
    const business = plansRead.plans.find((plan) => plan.name === "Business");
    assert.ok(business && business.limits.length === 6, "El plan Business o sus límites no provienen de la API.");

    const uniqueSlug = `persistencia-qa-${Date.now()}`;
    const created = await jsonRequest("/api/core/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Empresa Persistencia QA", slug: uniqueSlug, status: "ACTIVE", planId: business.id, branding: { displayName: "Empresa Persistencia QA", subdomain: uniqueSlug }, moduleIds: [], maxUsers: 3, admin: { name: "Admin Persistencia QA", email: `admin-${uniqueSlug}@qa.test`, password: "Temporary-QA-2026!" } }) }) as { tenant: ApiTenant };
    qaTenantId = created.tenant.id;
    const afterCreate = await jsonRequest("/api/core/tenants") as { tenants: ApiTenant[] };
    assert.ok(afterCreate.tenants.some((tenant) => tenant.id === qaTenantId), "La empresa creada no persistió tras una nueva consulta.");

    const callCenter = clinic.modules.find((item) => item.module.code === "call-center");
    assert.ok(callCenter, "No existe el módulo Call Center para Clínica Demo.");
    callCenterModuleId = callCenter.moduleId;
    originalCallCenterState = callCenter.enabled;
    await jsonRequest(`/api/core/tenants/${clinic.id}/modules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleId: callCenter.moduleId, enabled: !callCenter.enabled }) });
    const afterToggle = await jsonRequest("/api/core/tenants") as { tenants: ApiTenant[] };
    const persistedModule = afterToggle.tenants.find((tenant) => tenant.id === clinic.id)?.modules.find((item) => item.moduleId === callCenter.moduleId);
    assert.equal(persistedModule?.enabled, !originalCallCenterState, "El cambio del módulo no persistió tras una nueva consulta.");

    console.log(JSON.stringify({ database: "mentorify_platform", clinic: clinic.name, plan: clinic.plan.name, modules: clinic.modules.length, limits: clinic.plan.limits.length, createTenantPersists: true, moduleTogglePersists: true }, null, 2));
  } finally {
    if (clinicId && callCenterModuleId) await prisma.tenantModule.update({ where: { tenantId_moduleId: { tenantId: clinicId, moduleId: callCenterModuleId } }, data: { enabled: originalCallCenterState, activatedAt: originalCallCenterState ? new Date() : null } });
    if (qaTenantId) await prisma.tenant.delete({ where: { id: qaTenantId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
