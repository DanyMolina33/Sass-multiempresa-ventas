import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getSubordinates } from "@/lib/supervisor-team";

const TYPES = ["MOTIVATIONAL", "INFORMATIVE", "RECOGNITION", "URGENT"] as const;
const AUDIENCES = ["TEAM", "INDIVIDUAL", "SELECTED"] as const;

// MentoriFY Internal Messaging (section 35) — Supervisor may only address their own subordinates, never anyone
// else's team (section 87/88 spirit). One engine covers both plain messages and time-boxed campaigns (kind).
export async function GET() {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const messages = await getPrisma().internalMessage.findMany({
      where: { tenantId: context.tenantId, fromUserId: context.userId },
      include: { recipients: { select: { userId: true, readAt: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return Response.json({
      messages: messages.map((m) => ({
        id: m.id, kind: m.kind, type: m.type, title: m.title, body: m.body, cta: m.cta, status: m.status,
        startAt: m.startAt, endAt: m.endAt, createdAt: m.createdAt,
        recipientCount: m.recipients.length, readCount: m.recipients.filter((r) => r.readAt).length,
        recipients: m.recipients.map((r) => ({ userId: r.userId, name: r.user.name, read: Boolean(r.readAt) })),
      })),
    });
  } catch (error) { return crmError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireCrmContext();
    if (context.role !== "SUPERVISOR") throw new Response("Solo disponible para Supervisores", { status: 403 });
    const body = await request.json() as { audienceType?: string; recipientIds?: string[]; type?: string; title?: string; body?: string; kind?: string; cta?: string; endAt?: string };
    if (!body.title?.trim() || !body.body?.trim()) return Response.json({ message: "Título y mensaje son obligatorios." }, { status: 400 });
    const type = (TYPES as readonly string[]).includes(body.type ?? "") ? body.type! : "INFORMATIVE";
    const audience = (AUDIENCES as readonly string[]).includes(body.audienceType ?? "") ? body.audienceType! : "TEAM";
    const kind = body.kind === "CAMPAIGN" ? "CAMPAIGN" : "MESSAGE";
    const cta = ["NONE", "GOAL", "RANKING", "SALE"].includes(body.cta ?? "") ? body.cta! : "NONE";

    const team = await getSubordinates(context.tenantId, context.userId);
    const teamIds = new Set(team.map((m) => m.id));
    let recipientIds: string[];
    if (audience === "TEAM") recipientIds = [...teamIds];
    else {
      const requested = body.recipientIds ?? [];
      // Only ever the caller's own subordinates — silently drops anything outside the team rather than trusting the client list.
      recipientIds = requested.filter((id) => teamIds.has(id));
      if (!recipientIds.length) return Response.json({ message: "Selecciona al menos un promotor de tu equipo." }, { status: 400 });
    }
    if (!recipientIds.length) return Response.json({ message: "No tienes promotores en tu equipo para enviar este mensaje." }, { status: 400 });

    const prisma = getPrisma();
    const message = await prisma.internalMessage.create({
      data: {
        tenantId: context.tenantId, fromUserId: context.userId, kind: kind as never, type: type as never, cta: cta as never,
        title: body.title.trim(), body: body.body.trim(), status: "ACTIVE",
        endAt: body.endAt ? new Date(body.endAt) : null,
        recipients: { create: recipientIds.map((userId) => ({ tenantId: context.tenantId, userId })) },
      },
      include: { recipients: true },
    });
    return Response.json({ message }, { status: 201 });
  } catch (error) { return crmError(error); }
}
