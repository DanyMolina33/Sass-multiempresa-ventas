import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { serializeTenant, tenantInclude } from "@/lib/core-data";
import { isSuperAdmin, requireSession } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", message: "Configura DATABASE_URL para guardar cambios." }, { status: 503 });
  const { tenantId } = await params;
  try {
    const session = await requireSession();
    if (!isSuperAdmin(session)) return NextResponse.json({ message: "Solo SUPER_ADMIN puede asignar planes." }, { status: 403 });
    const body = await request.json() as { planId?: string };
    if (!body.planId) return NextResponse.json({ error: "VALIDATION_ERROR", message: "planId es obligatorio." }, { status: 400 });
    const tenant = await getPrisma().tenant.update({ where: { id: tenantId }, data: { planId: body.planId }, include: tenantInclude });
    return NextResponse.json({ tenant: serializeTenant(tenant) });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudo asignar el plan", error);
    return NextResponse.json({ error: "UPDATE_PLAN_FAILED", message: "No fue posible asignar el plan." }, { status: 400 });
  }
}
