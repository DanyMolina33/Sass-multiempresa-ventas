import { Prisma } from "@prisma/client";
import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requirePersonnelRead } from "@/lib/payroll-access";

function sumDecimal(values: Array<Prisma.Decimal | null>) { return values.reduce((total: Prisma.Decimal, value) => (value === null ? total : total.add(value)), new Prisma.Decimal(0)); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try {
  const context = await requireCrmContext(); await requireCrmFeature(context.tenantId, "payroll"); requirePersonnelRead(context.role);
  const { id: payrollPeriodId } = await params;
  const period = await getPrisma().payrollPeriod.findFirst({ where: { id: payrollPeriodId, tenantId: context.tenantId } });
  if (!period) throw new Response("Período fuera del tenant", { status: 403 });

  const search = new URL(request.url).searchParams;
  const jobPositionId = search.get("jobPositionId") || undefined, employmentType = search.get("employmentType") || undefined, term = search.get("search") || undefined;
  const employeeWhere = { ...(jobPositionId ? { jobPositionId } : {}), ...(employmentType ? { employmentType: employmentType as never } : {}), ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { document: { contains: term, mode: "insensitive" as const } }] } : {}) };

  const [allEntries, filteredEntries, activePersonnelCount] = await Promise.all([
    getPrisma().payrollEntry.findMany({ where: { tenantId: context.tenantId, payrollPeriodId, current: true } }),
    getPrisma().payrollEntry.findMany({ where: { tenantId: context.tenantId, payrollPeriodId, current: true, employee: employeeWhere }, include: { employee: { include: { jobPosition: true } } }, orderBy: { employee: { name: "asc" } } }),
    getPrisma().employee.count({ where: { tenantId: context.tenantId, status: "ACTIVE" } }),
  ]);

  const summary = {
    activePersonnel: activePersonnelCount,
    baseSalaries: sumDecimal(allEntries.map((e) => e.baseSalary)).toString(),
    commissions: sumDecimal(allEntries.map((e) => e.commissionAmount)).toString(),
    bonusesAndMobility: sumDecimal(allEntries.map((e) => e.bonusAmount)).add(sumDecimal(allEntries.map((e) => e.mobilityAmount))).toString(),
    employerContributions: sumDecimal(allEntries.map((e) => e.employerContributionsAmount)).toString(),
    netToPay: sumDecimal(allEntries.map((e) => e.netAmount)).toString(),
    projectedCost: sumDecimal(allEntries.map((e) => e.totalCompanyCost)).toString(),
  };

  return Response.json({ period, items: filteredEntries, summary });
} catch (error) { return crmError(error); } }
