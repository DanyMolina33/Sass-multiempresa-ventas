import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead, requirePersonnelWrite } from "@/lib/payroll-access";

const REGIMES = ["NINGUNO", "ONP", "AFP"] as const;

function percent(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Response(`${label} debe ser un porcentaje no negativo`, { status: 400 });
  return n;
}

export async function GET() { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const items = await getPrisma().pensionRegimeRate.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }] });
  return Response.json({ items });
} catch (error) { return crmError(error); } }

export async function POST(request: Request) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelWrite(context.role);
  const body = await request.json() as Record<string, unknown>;
  const regime = String(body.regime ?? "");
  if (!REGIMES.includes(regime as never)) throw new Response("Régimen pensionario inválido", { status: 400 });
  const name = String(body.name ?? "").trim();
  if (!name) throw new Response("El nombre de la tasa es obligatorio", { status: 400 });
  if (!body.effectiveFrom) throw new Response("La vigencia desde es obligatoria", { status: 400 });
  const item = await getPrisma().pensionRegimeRate.create({ data: {
    tenantId: context.tenantId, regime: regime as never, name,
    contributionPercentage: percent(body.contributionPercentage, "El aporte obligatorio"),
    insurancePercentage: percent(body.insurancePercentage, "La prima de seguro"),
    commissionPercentage: percent(body.commissionPercentage, "La comisión"),
    effectiveFrom: new Date(`${String(body.effectiveFrom).slice(0, 10)}T00:00:00Z`),
    effectiveTo: body.effectiveTo ? new Date(`${String(body.effectiveTo).slice(0, 10)}T23:59:59.999Z`) : null,
    sourceReference: String(body.sourceReference ?? "").trim() || null,
    active: body.active !== false,
  } });
  return Response.json({ item }, { status: 201 });
} catch (error) { return crmError(error); } }
