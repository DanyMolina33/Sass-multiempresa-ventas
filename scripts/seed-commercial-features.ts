import "dotenv/config";
import { getPrisma } from "../lib/prisma";

const FEATURES: Array<[string, string]> = [["commercial-management", "Gestión Comercial"], ["promoter-space", "Espacio Promotor"], ["commercial-stores", "Tiendas / Sucursales"]];

async function main() {
  const slug = process.argv[2] ?? "yc-telecomunicaciones";
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
  const template = await prisma.verticalTemplate.findUniqueOrThrow({ where: { code: "CRM_TELECOM" }, select: { id: true } });

  const activated: string[] = [];
  for (const [code, name] of FEATURES) {
    const feature = await prisma.verticalTemplateFeature.upsert({
      where: { verticalTemplateId_code: { verticalTemplateId: template.id, code } },
      update: { name },
      create: { verticalTemplateId: template.id, code, name, defaultActive: false },
    });
    await prisma.tenantCrmFeature.upsert({
      where: { tenantId_featureId: { tenantId: tenant.id, featureId: feature.id } },
      update: { active: true },
      create: { tenantId: tenant.id, featureId: feature.id, active: true },
    });
    activated.push(name);
  }
  console.log(JSON.stringify({ tenant: tenant.name, activatedFeatures: activated }, null, 2));
}
main().finally(() => getPrisma().$disconnect());
