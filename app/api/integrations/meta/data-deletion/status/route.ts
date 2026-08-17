import { getPrisma } from "@/lib/prisma";

// The status URL Meta's UI links a user to after submitting a deletion request via our data-deletion callback.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });
  const record = await getPrisma().metaDataDeletionRequest.findUnique({ where: { confirmationCode: id }, select: { status: true, createdAt: true, processedAt: true } });
  if (!record) return Response.json({ message: "Solicitud no encontrada." }, { status: 404 });
  return Response.json({ confirmation_code: id, status: record.status, requestedAt: record.createdAt, processedAt: record.processedAt });
}
