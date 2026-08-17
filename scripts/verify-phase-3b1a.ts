import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { normalizeProduct, prepareHistoricalRow } from "../lib/telecom-normalization";

const baseUrl = process.env.APP_URL ?? "http://localhost:3001", password = process.env.DEMO_PASSWORD;
if (!process.env.DATABASE_URL || !password) throw new Error("Entorno incompleto.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function login(email: string) { const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); assert.equal(response.status, 200); return response.headers.get("set-cookie")!.split(";")[0]; }
async function post(resource: string, cookie: string, body: object) { return fetch(`${baseUrl}/api/crm/${resource}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function patch(resource: string, id: string, cookie: string, body: object) { return fetch(`${baseUrl}/api/crm/${resource}/${id}`, { method: "PATCH", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

async function main() {
  let productId: string | undefined, planId: string | undefined;
  try {
    const [yc, clinic] = await Promise.all([prisma.tenant.findUniqueOrThrow({ where: { slug: "yc-telecomunicaciones" } }), prisma.tenant.findUniqueOrThrow({ where: { slug: "clinica-demo" } })]);
    const initialCounts = { customers: await prisma.customer.count({ where: { tenantId: yc.id } }), sales: await prisma.sale.count({ where: { tenantId: yc.id } }) };
    const catalog = await prisma.product.findMany({ where: { tenantId: yc.id }, orderBy: { code: "asc" } });
    assert.deepEqual(catalog.map((item) => item.code), ["INTERNET_FIJO", "INTERNET_INALAMBRICO", "OTRO", "POSTPAGO", "PREPAGO", "RENOVACION", "TELEFONIA_FIJA", "TV"]);
    assert.deepEqual([normalizeProduct("POST PAGO"), normalizeProduct("POSTPAGO"), normalizeProduct("POST-PAGO")].map((item) => item.status === "MAPPED" ? item.value : null), ["POSTPAGO", "POSTPAGO", "POSTPAGO"]);
    assert.equal(normalizeProduct("Producto histórico desconocido").status, "PENDIENTE_DE_MAPEO");
    const prepared = prepareHistoricalRow({ dni: "70.123.456", msisdn: "999-111-222", fecha: "19/07/2026", sec: " sec-1 ", sot: "sot 2", asesor: "  Ana   Pérez ", estado: "APROBADA", producto: "POST-PAGO", plan: "Max 29.90", tipoOperacion: "PORTABILIDAD" });
    assert.equal(prepared.product.status, "MAPPED"); assert.equal(prepared.sale.transactionType.status, "MAPPED");
    assert.deepEqual(initialCounts, { customers: await prisma.customer.count({ where: { tenantId: yc.id } }), sales: await prisma.sale.count({ where: { tenantId: yc.id } }) });

    const ycCookie = await login("admin@yctelecom.test"), clinicCookie = await login("admin@clinicademo.test");
    const code = `QA_${Date.now()}`;
    const productResponse = await post("products", ycCookie, { name: "Producto QA", code, category: "OTRO" }); assert.equal(productResponse.status, 201);
    productId = ((await productResponse.json()) as { item: { id: string } }).item.id;
    const planResponse = await post("commercial-plans", ycCookie, { name: "Plan QA", code, productId, price: "29.90", fixedCharge: "29.90", validFrom: "2026-07-01" }); assert.equal(planResponse.status, 201);
    planId = ((await planResponse.json()) as { item: { id: string } }).item.id;
    const savedPlan = await prisma.commercialPlan.findUniqueOrThrow({ where: { id: planId } }); assert.equal(savedPlan.productId, productId); assert.equal(savedPlan.tenantId, yc.id);
    assert.equal((await patch("products", productId, ycCookie, { status: "INACTIVE" })).status, 200); assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status, "INACTIVE");
    assert.equal((await patch("commercial-plans", planId, ycCookie, { status: "INACTIVE" })).status, 200); assert.equal((await prisma.commercialPlan.findUniqueOrThrow({ where: { id: planId } })).status, "INACTIVE");
    const clinicProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: clinic.id } });
    assert.equal((await post("commercial-plans", ycCookie, { name: "Cruce", code: `${code}_C1`, productId: clinicProduct.id })).status, 403);
    assert.equal((await post("commercial-plans", clinicCookie, { name: "Cruce", code: `${code}_C2`, productId })).status, 403);
    console.log(JSON.stringify({ initialProducts: catalog.map((item) => item.code), initialCommercialPlans: await prisma.commercialPlan.count({ where: { tenantId: yc.id, id: { not: planId } } }), companyAdminCreatesProduct: true, companyAdminCreatesPlan: true, sameTenantProductRequired: true, bidirectionalProductIsolation: true, productDeactivationPersists: true, planDeactivationPersists: true, postpaidAliasesUnified: true, unknownValuesPendingMapping: true, historicalRowsInserted: 0 }, null, 2));
  } finally {
    if (planId) await prisma.commercialPlan.deleteMany({ where: { id: planId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
