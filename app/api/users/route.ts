import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { isCompanyAdmin, isSuperAdmin, requireSession, tenantScope } from "@/lib/auth";
import { generateUniqueAccessCode } from "@/lib/access-code";
import { getPrisma } from "@/lib/prisma";

async function errorResponse(error: unknown) {
  // `throw new Response("some message", { status })` puts the text in the body, not statusText — reading
  // statusText alone (as this used to) silently drops every validation message and falls back to a generic one.
  if (error instanceof Response) return NextResponse.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
  console.error("Error administrando usuarios", error);
  return NextResponse.json({ message: "No fue posible completar la operación." }, { status: 400 });
}

async function userLimit(tenantId: string) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { limitOverrides: { include: { definition: true } }, plan: { include: { limits: { include: { definition: true } } } } } });
  const override = tenant.limitOverrides.find((item) => item.definition.code === "max-users");
  const planLimit = tenant.plan.limits.find((item) => item.definition.code === "max-users");
  return Number(override?.value ?? planLimit?.value ?? 0);
}

// A supervisor assignment is only meaningful for AGENT users, and must stay inside the same tenant: an inactive or
// wrong-role supervisorId would silently break hierarchy-based scoping in lib/crm-access.ts (teamUserIds).
async function resolveSupervisor(tenantId: string, roleCode: string, supervisorId: string | null | undefined) {
  if (roleCode !== "AGENT" || !supervisorId) return null;
  const supervisor = await getPrisma().user.findFirst({ where: { id: supervisorId, tenantId, status: "ACTIVE", role: { code: { in: ["SUPERVISOR", "COMPANY_ADMIN"] } } }, select: { id: true } });
  if (!supervisor) throw new Response("Supervisor no válido: debe ser un usuario activo de esta empresa con rol Supervisor.", { status: 400 });
  return supervisor.id;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!isCompanyAdmin(session) && !isSuperAdmin(session)) throw new Response("Sin permiso para ver usuarios", { status: 403 });
    const tenantId = tenantScope(session, request.nextUrl.searchParams.get("tenantId"));
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const [users, roles, limit, activeCount] = await Promise.all([
      getPrisma().user.findMany({ where: { tenantId, ...(includeInactive ? {} : { status: "ACTIVE" }) }, select: { id: true, name: true, email: true, jobTitle: true, status: true, supervisorId: true, accessCode: true, mustChangePassword: true, createdAt: true, role: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
      getPrisma().role.findMany({ where: { tenantId }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      userLimit(tenantId), getPrisma().user.count({ where: { tenantId, status: "ACTIVE" } }),
    ]);
    return NextResponse.json({ users, roles, limit, activeCount, canManage: isCompanyAdmin(session) || isSuperAdmin(session) });
  } catch (error) { return await errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!isCompanyAdmin(session) && !isSuperAdmin(session)) throw new Response("Sin permiso para crear usuarios", { status: 403 });
    const body = await request.json() as { name?: string; email?: string; password?: string; roleId?: string; tenantId?: string; supervisorId?: string | null };
    const tenantId = tenantScope(session, body.tenantId);
    if (!body.name?.trim() || !body.email?.trim() || !body.password || !body.roleId) return NextResponse.json({ message: "Nombre, correo, contraseña y rol son obligatorios." }, { status: 400 });
    if (body.password.length < 12) return NextResponse.json({ message: "La contraseña debe tener al menos 12 caracteres." }, { status: 400 });
    const [limit, activeCount, role, emailTaken] = await Promise.all([userLimit(tenantId), getPrisma().user.count({ where: { tenantId, status: "ACTIVE" } }), getPrisma().role.findFirst({ where: { id: body.roleId, tenantId } }), getPrisma().user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true } })]);
    if (activeCount >= limit) return NextResponse.json({ message: "Has alcanzado el límite de usuarios configurado para tu empresa." }, { status: 409 });
    if (!role || role.code === "SUPER_ADMIN") throw new Response("Rol no permitido para este tenant", { status: 403 });
    if (emailTaken) return NextResponse.json({ message: "Ya existe un usuario con este correo." }, { status: 409 });
    const supervisorId = await resolveSupervisor(tenantId, role.code, body.supervisorId);
    const accessCode = await generateUniqueAccessCode();
    // A temporary password set by the Gerente always forces a change on first login (section 59).
    const user = await getPrisma().user.create({ data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), passwordHash: await hash(body.password, 12), tenantId, roleId: role.id, supervisorId, accessCode, mustChangePassword: true }, select: { id: true, name: true, email: true, jobTitle: true, status: true, supervisorId: true, accessCode: true, mustChangePassword: true, role: { select: { id: true, code: true, name: true } } } });
    if (role.code === "SUPERVISOR" || role.code === "AGENT") {
      const tenantModules = await getPrisma().tenantModule.findMany({ where: { tenantId, enabled: true }, select: { moduleId: true } });
      if (tenantModules.length) await getPrisma().userModuleGrant.createMany({ data: tenantModules.map((tm) => ({ tenantId, userId: user.id, moduleId: tm.moduleId, enabled: true, grantedByUserId: session.user.id })) });
    }
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) { return await errorResponse(error); }
}
