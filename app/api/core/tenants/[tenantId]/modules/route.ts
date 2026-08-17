import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { isSuperAdmin, requireSession } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", message: "Configura DATABASE_URL para guardar cambios." }, { status: 503 });
  const { tenantId } = await params;
  try {
    const session = await requireSession();
    if (!isSuperAdmin(session)) return NextResponse.json({ message: "Solo SUPER_ADMIN puede modificar módulos." }, { status: 403 });
    const body = await request.json() as { moduleId?: string; enabled?: boolean };
    if (!body.moduleId || typeof body.enabled !== "boolean") return NextResponse.json({ error: "VALIDATION_ERROR", message: "moduleId y enabled son obligatorios." }, { status: 400 });
    const result = await getPrisma().tenantModule.update({
      where: { tenantId_moduleId: { tenantId, moduleId: body.moduleId } },
      data: { enabled: body.enabled, activatedAt: body.enabled ? new Date() : null },
      include: { module: true },
    });
    return NextResponse.json({ tenantModule: result });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudo actualizar el módulo del tenant", error);
    return NextResponse.json({ error: "UPDATE_MODULE_FAILED", message: "No fue posible guardar el estado del módulo." }, { status: 400 });
  }
}
