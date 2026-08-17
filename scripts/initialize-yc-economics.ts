import "dotenv/config";
import { initializePendingEconomicsForTenant } from "../lib/economic-engine";
import { getPrisma } from "../lib/prisma";

async function main(){
  const tenant=await getPrisma().tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"},select:{id:true}});
  const created=await initializePendingEconomicsForTenant(tenant.id);
  const summary=await getPrisma().saleEconomicCalculation.groupBy({by:["calculationStatus"],where:{tenantId:tenant.id,current:true},_count:{_all:true}});
  console.log(JSON.stringify({created,summary},null,2));
}
main().finally(()=>getPrisma().$disconnect());
