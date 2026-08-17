import { NextResponse } from "next/server";
import { getSession, safeSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autenticado" }, { status: 401 });
  return NextResponse.json({ session: safeSession(session) });
}
