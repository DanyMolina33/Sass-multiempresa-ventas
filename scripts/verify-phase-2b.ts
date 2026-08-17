import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.APP_URL ?? "http://localhost:3001";
const demoPassword = process.env.DEMO_PASSWORD;
if (!process.env.DATABASE_URL || !demoPassword) throw new Error("DATABASE_URL y DEMO_PASSWORD son obligatorias.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function login(email: string, password = demoPassword) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), redirect: "manual" });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  return { response, cookie };
}

async function main() {
  let tenantBId: string | undefined;
  let limitDefinitionId: string | undefined;
  const agent = await prisma.user.findUniqueOrThrow({ where: { email: "agente@clinicademo.test" } });
  const originalAgentStatus = agent.status;
  try {
    const clinic = await prisma.tenant.findUniqueOrThrow({ where: { slug: "clinica-demo" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "business" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Empresa B Seguridad QA", slug: `empresa-b-seguridad-${Date.now()}`, planId: plan.id } });
    tenantBId = tenantB.id;

    const companyLogin = await login("admin@clinicademo.test");
    assert.equal(companyLogin.response.status, 200, "COMPANY_ADMIN no pudo iniciar sesión.");
    assert.ok(companyLogin.cookie, "El login no entregó cookie HttpOnly.");

    const crossTenant = await fetch(`${baseUrl}/api/users?tenantId=${tenantB.id}`, { headers: { cookie: companyLogin.cookie! } });
    assert.equal(crossTenant.status, 403, "Empresa A pudo consultar Empresa B.");

    const globalPanel = await fetch(`${baseUrl}/`, { headers: { cookie: companyLogin.cookie! }, redirect: "manual" });
    assert.ok([307, 308].includes(globalPanel.status), "COMPANY_ADMIN accedió al Panel Maestro global.");
    assert.equal(new URL(globalPanel.headers.get("location")!, baseUrl).pathname, "/empresa");

    const maxUsers = await prisma.limitDefinition.findUniqueOrThrow({ where: { code: "max-users" } });
    limitDefinitionId = maxUsers.id;
    const activeCount = await prisma.user.count({ where: { tenantId: clinic.id, status: "ACTIVE" } });
    await prisma.tenantLimitOverride.upsert({ where: { tenantId_limitId: { tenantId: clinic.id, limitId: maxUsers.id } }, update: { value: activeCount }, create: { tenantId: clinic.id, limitId: maxUsers.id, value: activeCount } });
    const agentRole = await prisma.role.findFirstOrThrow({ where: { tenantId: clinic.id, code: "AGENT" } });
    const overLimit = await fetch(`${baseUrl}/api/users`, { method: "POST", headers: { "Content-Type": "application/json", cookie: companyLogin.cookie! }, body: JSON.stringify({ name: "Usuario Sobre Límite", email: `limit-${Date.now()}@qa.test`, password: "Temporary-QA-2026!", roleId: agentRole.id }) });
    assert.equal(overLimit.status, 409, "Se creó un usuario por encima del límite.");
    assert.equal((await overLimit.json() as { message: string }).message, "Has alcanzado el límite de usuarios configurado para tu empresa.");

    await prisma.user.update({ where: { id: agent.id }, data: { status: "INACTIVE" } });
    await prisma.session.deleteMany({ where: { userId: agent.id } });
    const inactiveLogin = await login(agent.email);
    assert.equal(inactiveLogin.response.status, 401, "Un usuario desactivado pudo iniciar sesión.");

    const anonymous = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert.ok([307, 308].includes(anonymous.status), "Una ruta protegida aceptó un usuario sin sesión.");
    assert.equal(new URL(anonymous.headers.get("location")!, baseUrl).pathname, "/login");

    console.log(JSON.stringify({ crossTenantDenied: true, companyAdminGlobalDenied: true, userLimitEnforced: true, inactiveLoginDenied: true, anonymousProtected: true }, null, 2));
  } finally {
    await prisma.user.update({ where: { id: agent.id }, data: { status: originalAgentStatus } });
    if (agent.tenantId && limitDefinitionId) await prisma.tenantLimitOverride.deleteMany({ where: { tenantId: agent.tenantId, limitId: limitDefinitionId } });
    if (tenantBId) await prisma.tenant.delete({ where: { id: tenantBId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
