import "dotenv/config";
import { getPrisma } from "../lib/prisma";

const JOB_POSITIONS = ["Gerente", "Subgerente", "Coordinador", "Supervisor", "Promotor", "Administrativo", "Contador", "Otro"];

async function main() {
  const slug = process.argv[2] ?? "yc-telecomunicaciones";
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
  const template = await prisma.verticalTemplate.findUniqueOrThrow({ where: { code: "CRM_TELECOM" }, select: { id: true } });

  const feature = await prisma.verticalTemplateFeature.upsert({
    where: { verticalTemplateId_code: { verticalTemplateId: template.id, code: "payroll" } },
    update: { name: "Pago de Personal" },
    create: { verticalTemplateId: template.id, code: "payroll", name: "Pago de Personal", defaultActive: false },
  });
  await prisma.tenantCrmFeature.upsert({
    where: { tenantId_featureId: { tenantId: tenant.id, featureId: feature.id } },
    update: { active: true },
    create: { tenantId: tenant.id, featureId: feature.id, active: true },
  });

  const upsertedPositions: string[] = [];
  for (const name of JOB_POSITIONS) {
    const item = await prisma.jobPosition.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: {}, create: { tenantId: tenant.id, name } });
    upsertedPositions.push(item.name);
  }
  const totalPositionsNow = await prisma.jobPosition.count({ where: { tenantId: tenant.id } });
  console.log(JSON.stringify({ tenant: tenant.name, payrollFeatureActive: true, upsertedPositions, totalPositionsNow }, null, 2));
}
main().finally(() => getPrisma().$disconnect());
