import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";

export const SESSION_COOKIE = "mentorify_session";
export const SELECTED_TENANT_COOKIE = "mentorify_selected_tenant";
const SESSION_DAYS = 7;

const sessionInclude = {
  user: { include: { tenant: { include: { branding: true, modules: { include: { module: true } } } }, role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function contextSignature(tenantId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET no está configurada");
  return createHmac("sha256", secret).update(tenantId).digest("base64url");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPrisma().session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
  store.delete(SELECTED_TENANT_COOKIE);
}

export async function setSelectedTenant(tenantId: string | null) {
  const store = await cookies();
  if (!tenantId) { store.delete(SELECTED_TENANT_COOKIE); return; }
  store.set(SELECTED_TENANT_COOKIE, `${tenantId}.${contextSignature(tenantId)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 });
}

export async function getSelectedTenant() {
  const value = (await cookies()).get(SELECTED_TENANT_COOKIE)?.value;
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const tenantId = value.slice(0, separator), signature = value.slice(separator + 1), expected = contextSignature(tenantId);
  const receivedBuffer = Buffer.from(signature), expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  return getPrisma().tenant.findFirst({ where: { id: tenantId, status: "ACTIVE" }, select: { id: true, name: true, slug: true, status: true } });
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getPrisma().session.findUnique({ where: { tokenHash: hashToken(token) }, include: sessionInclude });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Response("No autenticado", { status: 401 });
  return session;
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function hasPermission(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, permission: string) {
  return session.user.role.permissions.some((item) => item.permission.code === permission);
}

export function isSuperAdmin(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return session.user.role.code === "SUPER_ADMIN";
}

export function tenantScope(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, requestedTenantId?: string | null) {
  if (isSuperAdmin(session)) {
    if (!requestedTenantId) throw new Response("tenantId es obligatorio para esta operación global", { status: 400 });
    return requestedTenantId;
  }
  if (!session.user.tenantId) throw new Response("Usuario sin tenant", { status: 403 });
  if (requestedTenantId && requestedTenantId !== session.user.tenantId) throw new Response("Acceso a otro tenant denegado", { status: 403 });
  return session.user.tenantId;
}

export type SafeSession = { user: { id: string; name: string; email: string; tenantId: string | null; role: string; tenantName: string | null; permissions: string[]; activeModules: string[]; branding: { displayName: string; logoUrl: string | null; logoDarkUrl: string | null; primaryColor: string | null; secondaryColor: string | null; subdomain: string | null } | null } };
export function safeSession(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): SafeSession {
  const branding = session.user.tenant?.branding;
  return { user: { id: session.user.id, name: session.user.name, email: session.user.email, tenantId: session.user.tenantId, role: session.user.role.code, tenantName: session.user.tenant?.name ?? null, permissions: session.user.role.permissions.map((item) => item.permission.code), activeModules: session.user.tenant?.modules.filter((item) => item.enabled).map((item) => item.module.code) ?? [], branding: branding ? { displayName: branding.displayName, logoUrl: branding.logoUrl, logoDarkUrl: branding.logoDarkUrl, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, subdomain: branding.subdomain } : null } };
}

export function companyModuleEnabled(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, moduleCode: string) { return session.user.tenant?.modules.some((item) => item.enabled && item.module.code === moduleCode) ?? false; }
