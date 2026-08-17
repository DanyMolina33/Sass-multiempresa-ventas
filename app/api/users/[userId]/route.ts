import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { isCompanyAdmin, isSuperAdmin, requireSession, tenantScope } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// A supervisor assignment is only meaningful for AGENT users, and must stay inside the same tenant: an inactive or
// wrong-role supervisorId would silently break hierarchy-based scoping in lib/crm-access.ts (teamUserIds).
async function resolveSupervisor(tenantId: string, roleCode: string, supervisorId: string | null | undefined) {
  if (roleCode !== "AGENT") return null;
  if (supervisorId === undefined) return undefined; // not provided in this PATCH — leave unchanged
  if (supervisorId === null || supervisorId === "") return null; // explicit unassignment
  const supervisor = await getPrisma().user.findFirst({ where: { id: supervisorId, tenantId, status: "ACTIVE", role: { code: { in: ["SUPERVISOR", "COMPANY_ADMIN"] } } }, select: { id: true } });
  if (!supervisor) throw new Response("Supervisor no válido: debe ser un usuario activo de esta empresa con rol Supervisor.", { status: 400 });
  return supervisor.id;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await requireSession();
    if (!isCompanyAdmin(session) && !isSuperAdmin(session)) throw new Response("Sin permiso para editar usuarios", { status: 403 });
    const { userId } = await params;
    const body = await request.json() as { name?: string; email?: string; roleId?: string; supervisorId?: string | null; status?: "ACTIVE" | "INACTIVE"; password?: string; tenantId?: string };
    const target = await getPrisma().user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target?.tenantId) throw new Response("Usuario no encontrado en un tenant", { status: 404 });
    const tenantId = tenantScope(session, body.tenantId ?? target.tenantId);
    if (target.tenantId !== tenantId) throw new Response("Acceso a otro tenant denegado", { status: 403 });
    if (target.id === session.user.id && body.status === "INACTIVE") return NextResponse.json({ message: "No puedes desactivar tu propia cuenta." }, { status: 400 });

    let role = target.role;
    if (body.roleId && body.roleId !== target.roleId) {
      const found = await getPrisma().role.findFirst({ where: { id: body.roleId, tenantId } });
      if (!found || found.code === "SUPER_ADMIN") throw new Response("Rol no permitido", { status: 403 });
      role = found;
    }

    let email: string | undefined;
    if (body.email?.trim()) {
      email = body.email.trim().toLowerCase();
      if (email !== target.email) {
        const taken = await getPrisma().user.findUnique({ where: { email }, select: { id: true } });
        if (taken) return NextResponse.json({ message: "Ya existe un usuario con este correo." }, { status: 409 });
      }
    }

    let passwordHash: string | undefined;
    if (body.password) {
      if (body.password.length < 12) return NextResponse.json({ message: "La contraseña debe tener al menos 12 caracteres." }, { status: 400 });
      passwordHash = await hash(body.password, 12);
    }

    const supervisorId = role.code === "AGENT"
      ? await resolveSupervisor(tenantId, role.code, body.supervisorId)
      : null; // cleared automatically once the user is no longer an AGENT/Promotor

    const roleChanged = role.id !== target.roleId;
    const user = await getPrisma().user.update({
      where: { id: userId },
      // A Gerente-initiated password reset always forces a change on next login (section 63); mustChangePassword
      // is left untouched otherwise.
      data: { name: body.name?.trim(), email, roleId: body.roleId ? role.id : undefined, supervisorId, status: body.status, passwordHash, mustChangePassword: passwordHash ? true : undefined },
      select: { id: true, name: true, email: true, jobTitle: true, status: true, supervisorId: true, accessCode: true, mustChangePassword: true, role: { select: { id: true, code: true, name: true } } },
    });
    // Sessions carry the role/permissions snapshot from login, and a temp password is worthless if the old one still
    // works — invalidate on any of the three so the next request re-authenticates with the new state.
    if (body.status === "INACTIVE" || roleChanged || passwordHash) await getPrisma().session.deleteMany({ where: { userId } });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudo editar el usuario", error);
    return NextResponse.json({ message: "No fue posible editar el usuario." }, { status: 400 });
  }
}
