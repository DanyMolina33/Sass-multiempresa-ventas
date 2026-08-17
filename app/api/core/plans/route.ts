import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { serializeTenant } from "@/lib/core-data";
import { isSuperAdmin, requireSession } from "@/lib/auth";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", message: "Configura DATABASE_URL para consultar planes." }, { status: 503 });
  try {
    const session = await requireSession();
    const plans = await getPrisma().plan.findMany({ where: { status: "ACTIVE", ...(isSuperAdmin(session) ? {} : { tenants: { some: { id: session.user.tenantId ?? "__none__" } } }) }, include: { limits: { include: { definition: true } } }, orderBy: { name: "asc" } });
    return NextResponse.json({ plans: serializeTenant(plans) });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudieron listar los planes", error);
    return NextResponse.json({ error: "DATABASE_UNAVAILABLE", message: "No fue posible consultar PostgreSQL." }, { status: 503 });
  }
}
