import { NextResponse } from "next/server";
import { isCompanyAdmin, isSuperAdmin, requireSession, tenantScope } from "@/lib/auth";
import { getModuleGrantOverview } from "@/lib/module-entitlement";
import { getPrisma } from "@/lib/prisma";

async function errorResponse(error: unknown) {
  if (error instanceof Response) return NextResponse.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
  console.error("No se pudo gestionar módulos de usuario", error);
  return NextResponse.json({ message: "No fue posible completar la operación." }, { status: 400 });
}

// Only COMPANY_ADMIN may grant/revoke module access per user (sections 9/65) — SUPERVISOR/AGENT never reach here.
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await requireSession();
    if (!isCompanyAdmin(session) && !isSuperAdmin(session)) throw new Response("Sin permiso para ver módulos de usuarios", { status: 403 });
    const { userId } = await params;
    const target = await getPrisma().user.findUnique({ where: { id: userId }, select: { tenantId: true } });
    if (!target?.tenantId) throw new Response("Usuario no encontrado en un tenant", { status: 404 });
    const tenantId = tenantScope(session, new URL(request.url).searchParams.get("tenantId") ?? target.tenantId);
    if (target.tenantId !== tenantId) throw new Response("Acceso a otro tenant denegado", { status: 403 });
    return NextResponse.json({ modules: await getModuleGrantOverview(tenantId, userId) });
  } catch (error) { return await errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await requireSession();
    if (!isCompanyAdmin(session) && !isSuperAdmin(session)) throw new Response("Sin permiso para gestionar módulos de usuarios", { status: 403 });
    const { userId } = await params;
    const body = await request.json() as { moduleId?: string; enabled?: boolean; tenantId?: string };
    if (!body.moduleId || typeof body.enabled !== "boolean") return NextResponse.json({ message: "moduleId y enabled son obligatorios." }, { status: 400 });
    const target = await getPrisma().user.findUnique({ where: { id: userId }, select: { tenantId: true, role: { select: { code: true } } } });
    if (!target?.tenantId) throw new Response("Usuario no encontrado en un tenant", { status: 404 });
    const tenantId = tenantScope(session, body.tenantId ?? target.tenantId);
    if (target.tenantId !== tenantId) throw new Response("Acceso a otro tenant denegado", { status: 403 });
    // Never allow saving a grant beyond what the tenant itself has contracted (section 8: "Nunca permitir guardar un
    // grant fuera de tenant entitlement").
    const tenantModule = await getPrisma().tenantModule.findFirst({ where: { tenantId, moduleId: body.moduleId, enabled: true } });
    if (body.enabled && !tenantModule) return NextResponse.json({ message: "Este módulo no está contratado/habilitado para la empresa." }, { status: 400 });
    const grant = await getPrisma().userModuleGrant.upsert({
      where: { userId_moduleId: { userId, moduleId: body.moduleId } },
      update: { enabled: body.enabled, grantedByUserId: session.user.id },
      create: { tenantId, userId, moduleId: body.moduleId, enabled: body.enabled, grantedByUserId: session.user.id },
    });
    return NextResponse.json({ grant });
  } catch (error) { return await errorResponse(error); }
}
