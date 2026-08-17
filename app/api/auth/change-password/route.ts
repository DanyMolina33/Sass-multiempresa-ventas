import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { requireSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// Covers both flows with one endpoint (sections 61/62):
//  - forced first-login change (session.user.mustChangePassword === true): currentPassword NOT required, since the
//    user just authenticated with the temporary one moments ago.
//  - voluntary change from Mi Perfil (mustChangePassword already false): currentPassword IS required and verified.
// Never OTP. Sessions other than the one making this request are invalidated afterward.
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json() as { currentPassword?: string; newPassword?: string; confirmNewPassword?: string };
    if (!body.newPassword || body.newPassword.length < 12) return NextResponse.json({ message: "La nueva contraseña debe tener al menos 12 caracteres." }, { status: 400 });
    if (body.newPassword !== body.confirmNewPassword) return NextResponse.json({ message: "Las contraseñas no coinciden." }, { status: 400 });
    if (!session.user.mustChangePassword) {
      if (!body.currentPassword) return NextResponse.json({ message: "Ingresa tu contraseña actual." }, { status: 400 });
      const valid = await compare(body.currentPassword, session.user.passwordHash);
      if (!valid) return NextResponse.json({ message: "Contraseña actual incorrecta." }, { status: 401 });
    }
    const passwordHash = await hash(body.newPassword, 12);
    await getPrisma().user.update({ where: { id: session.user.id }, data: { passwordHash, mustChangePassword: false } });
    await getPrisma().session.deleteMany({ where: { userId: session.user.id, id: { not: session.id } } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: (await error.text()) || error.statusText || "Acceso denegado" }, { status: error.status });
    console.error("No se pudo cambiar la contraseña", error);
    return NextResponse.json({ message: "No fue posible cambiar la contraseña." }, { status: 400 });
  }
}
