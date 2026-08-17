import { requireWhatsAppContext, requireCompanyAdminForWhatsApp, whatsAppError } from "@/lib/integrations/whatsapp/access";
import { createTemplateForTenant, listTemplatesForTenant } from "@/lib/communication-core/whatsapp-service";
import { getPrisma } from "@/lib/prisma";

// Section 19 — base mínima: list what's cached locally; refresh from Meta only on demand (avoids hitting Graph
// API on every page load, and works even when Meta isn't reachable by showing the last known state).
export async function GET(request: Request) {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (refresh) {
      const templates = await listTemplatesForTenant(context.tenantId);
      return Response.json({ templates });
    }
    const connection = await getPrisma().whatsAppConnection.findUnique({ where: { tenantId: context.tenantId } });
    const templates = connection ? await getPrisma().whatsAppTemplate.findMany({ where: { tenantId: context.tenantId, connectionId: connection.id }, orderBy: { updatedAt: "desc" } }) : [];
    return Response.json({ templates });
  } catch (error) { return whatsAppError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireWhatsAppContext();
    requireCompanyAdminForWhatsApp(context.role);
    const body = await request.json() as { name?: string; language?: string; category?: string; bodyText?: string };
    if (!body.name?.trim() || !body.language?.trim() || !body.category?.trim() || !body.bodyText?.trim()) return Response.json({ message: "Nombre, idioma, categoría y texto son obligatorios." }, { status: 400 });
    const template = await createTemplateForTenant(context.tenantId, { name: body.name.trim(), language: body.language.trim(), category: body.category.trim(), bodyText: body.bodyText.trim() });
    return Response.json({ template }, { status: 201 });
  } catch (error) { return whatsAppError(error); }
}
