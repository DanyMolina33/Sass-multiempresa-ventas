import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/dashboard/:path*", "/empresas/:path*", "/empresa/:path*", "/usuarios/:path*", "/crm/:path*", "/call-center/:path*", "/sms-center/:path*", "/whatsapp/:path*", "/guardian/:path*", "/reportes/:path*", "/configuracion/:path*"] };
