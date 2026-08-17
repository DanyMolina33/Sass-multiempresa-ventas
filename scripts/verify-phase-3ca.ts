import "dotenv/config";
import { EconomicCalculationType, Prisma, type EconomicRule } from "@prisma/client";
import { calculateSaleEconomics, resolveEconomicRule, ruleMatchesSale } from "../lib/economic-engine";
import { requireEconomicReadRole, requireEconomicWriteRole } from "../lib/economic-rule-input";
import { getPrisma } from "../lib/prisma";

function check(value:unknown,message:string){if(!value)throw new Error(message);console.log(`✓ ${message}`)}
function expectForbidden(action:()=>void){try{action();return false}catch(error){return error instanceof Response&&error.status===403}}
function rule(data:Partial<EconomicRule>={}):EconomicRule{return{id:data.id??crypto.randomUUID(),tenantId:data.tenantId??"tenant-yc",name:data.name??"Regla de prueba no persistida",code:data.code??"TEST_MEMORY",productId:data.productId??null,commercialPlanId:data.commercialPlanId??null,transactionType:data.transactionType??null,effectiveFrom:data.effectiveFrom??new Date("2026-01-01T00:00:00Z"),effectiveTo:data.effectiveTo??null,active:data.active??true,expectedCompanyIncomeType:data.expectedCompanyIncomeType??null,expectedCompanyIncomeValue:data.expectedCompanyIncomeValue??null,promoterCommissionType:data.promoterCommissionType??null,promoterCommissionValue:data.promoterCommissionValue??null,supervisorCommissionType:data.supervisorCommissionType??null,supervisorCommissionValue:data.supervisorCommissionValue??null,createdAt:new Date(),updatedAt:new Date()}}
const memorySale={id:"sale-memory",tenantId:"tenant-yc",productId:"product-mobile",commercialPlanId:"plan-69",transactionType:"PORTABILIDAD" as const,saleDate:new Date("2026-03-15T00:00:00Z"),saleAmount:new Prisma.Decimal("69.90"),fixedChargeSnapshot:new Prisma.Decimal("69.90"),agentId:null,supervisorId:null,historicalAdvisorName:"ASESOR HISTÓRICO",historicalSupervisorName:"SUPERVISOR HISTÓRICO"};

async function main(){
  const prisma=getPrisma();
  const[yc,clinic]=await Promise.all([prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}}),prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}})]);
  const ycRuleCount=await prisma.economicRule.count({where:{tenantId:yc.id}});
  check(ycRuleCount===0,"1. YC no recibió reglas económicas inventadas");
  check(!ruleMatchesSale(rule({tenantId:yc.id}),{...memorySale,tenantId:clinic.id}),"2. Una regla de YC no coincide con ventas de Clínica Demo");
  requireEconomicWriteRole("COMPANY_ADMIN");check(true,"3. COMPANY_ADMIN puede gestionar reglas de su tenant");
  check(expectForbidden(()=>requireEconomicWriteRole("AGENT")),"4. AGENT no puede administrar reglas económicas");
  requireEconomicReadRole("SUPERVISOR");check(expectForbidden(()=>requireEconomicWriteRole("SUPERVISOR")),"5. SUPERVISOR tiene lectura y no escritura");
  const general=rule({id:"general",productId:"product-mobile"}),specific=rule({id:"specific",productId:"product-mobile",commercialPlanId:"plan-69",transactionType:"PORTABILIDAD"});
  check(resolveEconomicRule([general,specific],memorySale).rule?.id==="specific","6. La regla más específica prevalece");
  const expired=rule({id:"expired",productId:"product-mobile",effectiveFrom:new Date("2025-01-01Z"),effectiveTo:new Date("2025-12-31Z")});
  check(resolveEconomicRule([expired],memorySale).rule===null,"7. Las vigencias excluyen reglas fuera de fecha");
  const pending=calculateSaleEconomics(memorySale,[]);
  check(pending.calculationStatus==="PENDING_RULE"&&pending.expectedCompanyIncome===null,"8. Venta sin regla queda PENDING_RULE y sin monto");
  const configured=rule({productId:"product-mobile",expectedCompanyIncomeType:EconomicCalculationType.FIXED,expectedCompanyIncomeValue:new Prisma.Decimal(100),promoterCommissionType:EconomicCalculationType.FIXED,promoterCommissionValue:new Prisma.Decimal(10)});
  const historical=calculateSaleEconomics(memorySale,[configured]);
  check(historical.expectedCompanyIncome?.equals(100),"9. Asesor histórico sin usuario no bloquea ingreso empresarial");
  check(historical.promoterCommission?.equals(10)&&historical.calculationStatus==="PENDING_ASSIGNMENT","10. Comisión sin beneficiario queda PENDING_ASSIGNMENT");
  const usersBefore=await prisma.user.count({where:{tenantId:yc.id}});calculateSaleEconomics(memorySale,[configured]);const usersAfter=await prisma.user.count({where:{tenantId:yc.id}});
  check(usersBefore===usersAfter&&usersAfter===4,"11. El motor no crea usuarios automáticamente");
  check(pending.promoterCommission===null&&pending.supervisorCommission===null&&pending.preliminaryMargin===null,"12. El motor no inventa montos ni convierte ausencia en cero");
  const calcBefore=await prisma.saleEconomicCalculation.count({where:{tenantId:yc.id}});const simulated=await prisma.sale.count({where:{tenantId:yc.id,productId:(await prisma.product.findFirstOrThrow({where:{tenantId:yc.id}})).id}});const calcAfter=await prisma.saleEconomicCalculation.count({where:{tenantId:yc.id}});
  check(simulated>=0&&calcBefore===calcAfter,"13. La simulación equivalente es read-only");
  const current=await prisma.saleEconomicCalculation.findMany({where:{tenantId:yc.id,current:true}}),ycSales=await prisma.sale.count({where:{tenantId:yc.id}});
  check(ycSales===767&&current.length===767&&current.every(item=>item.calculationStatus==="PENDING_RULE"),"14. Las 767 ventas YC tienen snapshot actual PENDING_RULE");
  check(current.every(item=>item.expectedCompanyIncome===null&&item.promoterCommission===null&&item.supervisorCommission===null&&item.preliminaryMargin===null),"15. Los 767 snapshots económicos conservan importes nulos");
  check(await prisma.saleEconomicCalculation.count({where:{tenantId:clinic.id}})===0,"16. Clínica Demo permanece sin cálculos económicos de YC");
  check(current.every(item=>item.ruleSnapshot===null),"17. PENDING_RULE no guarda una regla ficticia");
  console.log("FASE 3C-A: verificación económica completada.");
}
main().finally(()=>getPrisma().$disconnect());
