import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.APP_URL ?? "http://localhost:3001";
const password = process.env.DEMO_PASSWORD;
if (!process.env.DATABASE_URL || !password) throw new Error("DATABASE_URL y DEMO_PASSWORD son obligatorias.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function absorb(cookie: string, response: Response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  const jar = new Map(cookie.split("; ").filter(Boolean).map((part) => { const index = part.indexOf("="); return [part.slice(0, index), part.slice(index + 1)]; }));
  for (const value of values) {
    const part = value.split(";")[0], index = part.indexOf("=");
    if (index > 0) { const key = part.slice(0, index), val = part.slice(index + 1); if (val) jar.set(key, val); else jar.delete(key); }
  }
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `${email} no pudo iniciar sesión.`);
  return absorb("", response);
}

async function main() {
  try {
    const [yc, clinic] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: "yc-telecomunicaciones" }, include: { plan: true, modules: { include: { module: true } }, users: { include: { role: true } }, pipelineStages: { orderBy: { order: "asc" } } } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: "clinica-demo" }, include: { users: true } }),
    ]);
    assert.equal(yc.name, "YC Telecomunicaciones"); assert.equal(yc.status, "ACTIVE"); assert.equal(yc.plan.code, "business");
    assert.equal(await prisma.tenant.count({ where: { slug: yc.slug } }), 1);
    const expectedModules: Record<string, boolean> = { crm: true, reportes: true, guardian: false, "call-center": false, "sms-center": false, whatsapp: false };
    const moduleStatus = Object.fromEntries(yc.modules.map((item) => [item.module.code, item.enabled]));
    assert.deepEqual(moduleStatus, expectedModules);
    assert.equal(yc.users.length, 4);
    assert.deepEqual(yc.users.map((user) => user.email).sort(), ["admin@yctelecom.test", "promotor1@yctelecom.test", "promotor2@yctelecom.test", "supervisor@yctelecom.test"]);
    assert.deepEqual(yc.users.map((user) => user.role.code).sort(), ["AGENT", "AGENT", "COMPANY_ADMIN", "SUPERVISOR"]);
    assert.ok(yc.users.every((user) => user.tenantId === yc.id)); assert.ok(clinic.users.every((user) => user.tenantId === clinic.id));
    assert.equal(yc.users.some((a) => clinic.users.some((b) => b.id === a.id || b.email === a.email)), false);
    const supervisor = yc.users.find((user) => user.role.code === "SUPERVISOR"); const agents = yc.users.filter((user) => user.role.code === "AGENT");
    assert.ok(supervisor); assert.equal(agents.length, 2); assert.ok(agents.every((agent) => agent.supervisorId === supervisor.id));
    const expectedStages = ["NUEVO", "ASIGNADO", "CONTACTADO", "INTERESADO", "DOCUMENTOS_PENDIENTES", "VENTA_REGISTRADA", "EN_VALIDACION", "APROBADA", "ACTIVADA", "RECHAZADA", "CANCELADA", "NO_INTERESADO", "NO_CONTACTABLE"];
    assert.deepEqual(yc.pipelineStages.map((stage) => stage.code), expectedStages); assert.deepEqual(yc.pipelineStages.map((stage) => stage.order), expectedStages.map((_, index) => index + 1));
    const ycCookie = await login("admin@yctelecom.test"), clinicCookie = await login("admin@clinicademo.test");
    assert.equal((await fetch(`${baseUrl}/api/users?tenantId=${clinic.id}`, { headers: { cookie: ycCookie } })).status, 403, "YC pudo consultar Clínica Demo.");
    assert.equal((await fetch(`${baseUrl}/api/users?tenantId=${yc.id}`, { headers: { cookie: clinicCookie } })).status, 403, "Clínica Demo pudo consultar YC.");
    let superCookie = await login("superadmin@mentorify.test");
    const selection = await fetch(`${baseUrl}/api/auth/tenant-context`, { method: "POST", headers: { cookie: superCookie, "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: yc.id }) });
    assert.equal(selection.status, 200); superCookie = absorb(superCookie, selection);
    const metaResponse = await fetch(`${baseUrl}/api/crm/meta`, { headers: { cookie: superCookie } }); assert.equal(metaResponse.status, 200);
    const meta = await metaResponse.json() as { stages: Array<{ code: string }>; users: unknown[]; products: unknown[]; commercialPlans: unknown[]; leads: unknown[]; customers: unknown[] };
    assert.deepEqual(meta.stages.map((stage) => stage.code), expectedStages); assert.equal(meta.users.length, 4);
    assert.equal(meta.products.length, 8); assert.equal(meta.commercialPlans.length, 0); assert.equal(meta.leads.length, 0); assert.equal(meta.customers.length, 0);
    console.log(JSON.stringify({ tenantId: yc.id, name: yc.name, slug: yc.slug, plan: yc.plan.name, modules: moduleStatus, users: yc.users.map((user) => ({ name: user.name, email: user.email, role: user.role.code })), hierarchy: { supervisor: supervisor.email, agents: agents.map((agent) => agent.email) }, pipelineStages: yc.pipelineStages.length, bidirectionalIsolation: true, superAdminCrmAccess: true, crmBusinessDataEmpty: true }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
