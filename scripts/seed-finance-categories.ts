import "dotenv/config";
import { getPrisma } from "../lib/prisma";

const EXPENSE_CATEGORIES = ["Alquiler", "Servicios", "Internet y telefonía", "Movilidad y pasajes", "Publicidad", "Planilla y personal", "Comisiones comerciales", "Gastos de tienda", "Equipamiento", "Mantenimiento", "Impuestos y tasas", "Otros gastos"];
const INCOME_CATEGORIES = ["Ingreso extraordinario", "Bonificación", "Incentivo comercial", "Ajuste positivo", "Otros ingresos"];

async function main() {
  const slug = process.argv[2] ?? "yc-telecomunicaciones";
  const tenant = await getPrisma().tenant.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
  const upserted: string[] = [];
  for (const name of EXPENSE_CATEGORIES) {
    const item = await getPrisma().financeCategory.upsert({ where: { tenantId_type_name: { tenantId: tenant.id, type: "GASTO", name } }, update: {}, create: { tenantId: tenant.id, type: "GASTO", name } });
    upserted.push(`GASTO:${item.name}`);
  }
  for (const name of INCOME_CATEGORIES) {
    const item = await getPrisma().financeCategory.upsert({ where: { tenantId_type_name: { tenantId: tenant.id, type: "INGRESO", name } }, update: {}, create: { tenantId: tenant.id, type: "INGRESO", name } });
    upserted.push(`INGRESO:${item.name}`);
  }
  const totalCategoriesNow = await getPrisma().financeCategory.count({ where: { tenantId: tenant.id } });
  console.log(JSON.stringify({ tenant: tenant.name, upserted, totalCategoriesNow }, null, 2));
}
main().finally(() => getPrisma().$disconnect());
