import { NextResponse } from "next/server";
import { hasPermission, isSuperAdmin, requireSession, tenantScope } from "@/lib/auth";
import { generateUniqueAccessCode } from "@/lib/access-code";
import { getPrisma } from "@/lib/prisma";

// Generates a code on first use, or replaces it on explicit "Regenerar enlace" — either way the previous code
// (if any) stops resolving immediately, since it's simply overwritten, not kept as a second valid value.
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await requireSession();
    if (!hasPermission(session, "users.manage") && !isSuperAdmin(session)) throw new Response("Sin permiso para gestionar accesos", { status: 403 });
    const { userId } = await params;
    const body = await request.json().catch(() => ({})) as { tenantId?: string };
    const target = await getPrisma().user.findUnique({ where: { id: userId }, select: { tenantId: true } });
    if (!target?.tenantId) throw new Response("Usuario no encontrado en un tenant", { status: 404 });
    const tenantId = tenantScope(session, body.tenantId ?? target.tenantId);
    if (target.tenantId !== tenantId) throw new Response("Acceso a otro tenant denegado", { status: 403 });
    const accessCode = await generateUniqueAccessCode();
    const user = await getPrisma().user.update({ where: { id: userId }, data: { accessCode }, select: { id: true, accessCode: true } });
    return NextResponse.json({ accessCode: user.accessCode });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudo generar el enlace corto", error);
    return NextResponse.json({ message: "No fue posible generar el enlace corto." }, { status: 400 });
  }
}
