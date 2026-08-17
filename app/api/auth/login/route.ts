import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { createSession, safeSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json() as { email?: string; password?: string; tenantSlug?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password) return NextResponse.json({ message: "Correo y contraseña son obligatorios." }, { status: 400 });
  const user = await getPrisma().user.findUnique({ where: { email }, include: { tenant: { include: { branding: true, modules: { include: { module: true } } } }, role: { include: { permissions: { include: { permission: true } } } } } });
  const valid = user ? await compare(body.password, user.passwordHash) : false;
  const requestedTenant = body.tenantSlug ? await getPrisma().tenant.findFirst({ where: { status: "ACTIVE", OR: [{ slug: body.tenantSlug }, { branding: { subdomain: body.tenantSlug } }] }, select: { id: true } }) : null;
  if (!user || !valid || user.status !== "ACTIVE" || (body.tenantSlug && (!requestedTenant || user.tenantId !== requestedTenant.id))) return NextResponse.json({ message: "Credenciales inválidas o usuario inactivo." }, { status: 401 });
  await getPrisma().session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  return NextResponse.json({ session: safeSession({ id: "new", tokenHash: "", userId: user.id, expiresAt: new Date(), createdAt: new Date(), user }) });
}
