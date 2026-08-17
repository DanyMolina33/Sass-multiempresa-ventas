import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";

// Deployment healthcheck (block 33) — public, unauthenticated, fast. Coolify/any orchestrator polls this
// directly; a 401 from an authenticated route isn't a valid healthcheck signal, so this exists instead of
// reusing one. Confirms the app process AND the database connection are both actually up, not just the process.
export async function GET() {
  if (!isDatabaseConfigured()) return Response.json({ status: "error", database: "not_configured" }, { status: 503 });
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" }, { status: 200 });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
