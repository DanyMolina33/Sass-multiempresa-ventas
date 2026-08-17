import { assignedScope, crmError, requireCrmContext, validateAssignableUser } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function GET(_request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const context = await requireCrmContext(); const { resource } = await params; await requireCrmFeature(context.tenantId,resource); const prisma = getPrisma();
    if (resource === "leads") return Response.json({ items: await prisma.lead.findMany({ where: { tenantId: context.tenantId, ...assignedScope(context, "assignedUserId") }, include: { pipelineStage: true, assignedUser: { select: { id: true, name: true } }, supervisor: { select: { id: true, name: true } }, stageHistory: { include: { pipelineStage: true, changedByUser: { select: { name: true } } }, orderBy: { changedAt: "desc" } } }, orderBy: { updatedAt: "desc" } }) });
    if (resource === "customers") return Response.json({ items: await prisma.customer.findMany({ where: { tenantId: context.tenantId, ...assignedScope(context, "ownerUserId") }, include: { ownerUser: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } }) });
    if (resource === "follow-ups") return Response.json({ items: await prisma.followUp.findMany({ where: { tenantId: context.tenantId, ...assignedScope(context, "assignedUserId") }, include: { lead: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } }, assignedUser: { select: { id: true, name: true } } }, orderBy: { scheduledAt: "asc" } }) });
    if (resource === "products") return Response.json({ items: await prisma.product.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } }) });
    if (resource === "commercial-plans") return Response.json({ items: await prisma.commercialPlan.findMany({ where: { tenantId: context.tenantId }, include: { product: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }) });
    return Response.json({ message: "Recurso no encontrado" }, { status: 404 });
  } catch (error) { return crmError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const context = await requireCrmContext(); const { resource } = await params; await requireCrmFeature(context.tenantId,resource); const body = await request.json(); const prisma = getPrisma();
    if (resource === "leads") {
      const stage = await prisma.pipelineStage.findFirst({ where: { id: body.pipelineStageId, tenantId: context.tenantId } }); if (!stage) throw new Response("Estado comercial de otro tenant", { status: 403 });
      const assignedId = context.role === "AGENT" ? context.userId : body.assignedUserId; const assignee = assignedId ? await validateAssignableUser(context, assignedId) : null;
      const lead = await prisma.lead.create({ data: { tenantId: context.tenantId, name: body.name, document: body.document || null, phone: body.phone, email: body.email || null, origin: body.origin, notes: body.notes || null, pipelineStageId: stage.id, assignedUserId: assignee?.id, supervisorId: assignee?.supervisorId ?? (assignee?.role.code === "SUPERVISOR" ? assignee.id : null), stageHistory: { create: { tenantId: context.tenantId, pipelineStageId: stage.id, changedByUserId: context.userId } } } }); return Response.json({ item: lead }, { status: 201 });
    }
    if (resource === "customers") { const ownerId = context.role === "AGENT" ? context.userId : body.ownerUserId; if (ownerId) await validateAssignableUser(context, ownerId); const item = await prisma.customer.create({ data: { tenantId: context.tenantId, name: body.name, document: body.document || null, phone: body.phone, email: body.email || null, city: body.city || null, address: body.address || null, ownerUserId: ownerId || null } }); return Response.json({ item }, { status: 201 }); }
    if (resource === "follow-ups") { const assignedId = context.role === "AGENT" ? context.userId : body.assignedUserId; await validateAssignableUser(context, assignedId); if (!body.leadId && !body.customerId) return Response.json({ message: "Relaciona un lead o cliente." }, { status: 400 }); if (body.leadId && !await prisma.lead.findFirst({ where: { id: body.leadId, tenantId: context.tenantId, ...assignedScope(context, "assignedUserId") } })) throw new Response("Lead de otro tenant o fuera de alcance", { status: 403 }); if (body.customerId && !await prisma.customer.findFirst({ where: { id: body.customerId, tenantId: context.tenantId, ...assignedScope(context, "ownerUserId") } })) throw new Response("Cliente de otro tenant o fuera de alcance", { status: 403 }); const item = await prisma.followUp.create({ data: { tenantId: context.tenantId, leadId: body.leadId || null, customerId: body.customerId || null, assignedUserId: assignedId, scheduledAt: new Date(body.scheduledAt), type: body.type, notes: body.notes || null } }); return Response.json({ item }, { status: 201 }); }
    if (!["COMPANY_ADMIN","SUPER_ADMIN"].includes(context.role)) throw new Response("Solo administración gestiona catálogo", { status: 403 });
    if (resource === "products") {
      if (!body.name?.trim() || !body.code?.trim() || !body.category?.trim()) return Response.json({ message: "Nombre, código y categoría son obligatorios." }, { status: 400 });
      const item = await prisma.product.create({ data: { tenantId: context.tenantId, name: body.name.trim(), code: body.code.trim().toUpperCase(), category: body.category.trim().toUpperCase() } }); return Response.json({ item }, { status: 201 });
    }
    if (resource === "commercial-plans") {
      if (!body.name?.trim() || !body.code?.trim() || !body.productId) return Response.json({ message: "Nombre, código y producto son obligatorios." }, { status: 400 });
      const product = await prisma.product.findFirst({ where: { id: body.productId, tenantId: context.tenantId } }); if (!product) throw new Response("Producto de otro tenant", { status: 403 });
      const item = await prisma.commercialPlan.create({ data: { tenantId: context.tenantId, productId: product.id, name: body.name.trim(), code: body.code.trim().toUpperCase(), price: body.price ? Number(body.price) : null, fixedCharge: body.fixedCharge ? Number(body.fixedCharge) : null, validFrom: body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo ? new Date(body.validTo) : null } }); return Response.json({ item }, { status: 201 });
    }
    return Response.json({ message: "Recurso no encontrado" }, { status: 404 });
  } catch (error) { return crmError(error); }
}
