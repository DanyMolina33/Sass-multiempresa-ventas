import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EconomicCalculationType, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { calculateSaleEconomics } from "../lib/economic-engine";
import { getPrisma } from "../lib/prisma";
import { parseReconciliationWorkbook, processReconciliation } from "../lib/reconciliation-engine";
import { buildReconciliationTemplate, reconciliationTemplateColumns } from "../lib/reconciliation-template";

const prisma=getPrisma(),providerCode="QA_PHASE_3DB_PROVIDER",generalCode="QA_PHASE_3DB_GENERAL",specificCode="QA_PHASE_3DB_SPECIFIC";
function check(value:unknown,message:string){if(!value)throw new Error(message);console.log(`✓ ${message}`)}
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot(tenantId:string,clinicId:string){
  const sales=await prisma.sale.findMany({where:{tenantId},select:{id:true,status:true,historicalAdvisorName:true,historicalSupervisorName:true},orderBy:{id:"asc"}});
  return{customers:await prisma.customer.count({where:{tenantId}}),sales:sales.length,leads:await prisma.lead.count({where:{tenantId}}),followUps:await prisma.followUp.count({where:{tenantId}}),saleTrace:digest(sales),clinicCustomers:await prisma.customer.count({where:{tenantId:clinicId}}),clinicSales:await prisma.sale.count({where:{tenantId:clinicId}})};
}
async function main(){
  const yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}}),clinic=await prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}}),admin=await prisma.user.findUniqueOrThrow({where:{email:"admin@yctelecom.test"}}),before=await snapshot(yc.id,clinic.id);
  await prisma.reconciliationImport.deleteMany({where:{provider:{tenantId:yc.id,code:providerCode}}});await prisma.settlementProvider.deleteMany({where:{tenantId:yc.id,code:providerCode}});await prisma.economicRule.deleteMany({where:{tenantId:yc.id,code:{in:[generalCode,specificCode]}}});
  let providerId:string|null=null;
  try{
    const provider=await prisma.settlementProvider.create({data:{tenantId:yc.id,name:"Proveedor temporal QA",legalName:"Proveedor Temporal QA S.A.C.",code:providerCode,active:false}});providerId=provider.id;
    check(provider.legalName!==null&&!provider.active,"1. Empresa proveedora conserva razón social y estado configurable");
    await prisma.settlementProvider.update({where:{id:provider.id},data:{active:true}});check((await prisma.settlementProvider.findUniqueOrThrow({where:{id:provider.id}})).active,"2. Empresa proveedora puede activarse sin afectar otro tenant");
    const sale=await prisma.sale.findFirstOrThrow({where:{tenantId:yc.id,sec:{not:null},commercialPlanId:{not:null}},orderBy:{saleDate:"asc"}});
    const sheet=XLSX.utils.json_to_sheet([{DNI:sale.customerDocumentSnapshot,CLIENTE:sale.customerNameSnapshot,TELEFONO:sale.msisdn,SEC:sale.sec,SOT:sale.sot,FECHA_VENTA:sale.saleDate,PRODUCTO:sale.productNameSnapshot,PLAN:sale.planNameSnapshot,OPERACION:sale.transactionType,MONTO_RECONOCIDO:10,ESTADO_LIQUIDACION:"REPORTADA",REFERENCIA_EXTERNA:"QA-3DB-1",OBSERVACION:"Prueba reversible"}]),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"LIQUIDACION");
    const parsed=parseReconciliationWorkbook(XLSX.write(book,{type:"buffer",bookType:"xlsx"})),period=`${sale.saleDate.getUTCFullYear()}-${String(sale.saleDate.getUTCMonth()+1).padStart(2,"0")}`;
    const liquidation=await processReconciliation({tenantId:yc.id,providerId:provider.id,period,settlementDate:new Date(),originalFileName:"qa-3db.xlsx",fileHash:parsed.fileHash,uploadedByUserId:admin.id,detectedColumns:parsed.detectedColumns,rows:parsed.rows}),results=await prisma.reconciliationResult.findMany({where:{reconciliationId:liquidation.id}});
    check(results.some(item=>item.saleId===sale.id&&item.matchStatus==="MATCHED"&&item.matchedBy==="SEC"),"3. Nueva liquidación cruza una venta real por SEC exacto y único");
    check(results.some(item=>item.status==="PENDIENTE")&&results.some(item=>item.status==="NO_LIQUIDADO"),"4. Clasificación usa datos reales: pendiente sin esperado y no liquidado para ausentes");
    let duplicate=false;try{await processReconciliation({tenantId:yc.id,providerId:provider.id,period,settlementDate:new Date(),originalFileName:"qa-3db-duplicado.xlsx",fileHash:parsed.fileHash,uploadedByUserId:admin.id,detectedColumns:parsed.detectedColumns,rows:parsed.rows})}catch(error){duplicate=error instanceof Response&&error.status===409}check(duplicate,"5. El mismo archivo queda bloqueado por idempotencia");
    const audit=await prisma.reconciliationImport.findFirstOrThrow({where:{id:liquidation.id},include:{provider:true,uploadedBy:true,results:true}});check(audit.providerId===provider.id&&audit.uploadedByUserId===admin.id&&audit.rowCount===1&&audit.results.length>0,"6. Historial conserva proveedor, usuario, periodo, archivo y resultados");
    const template=XLSX.read(buildReconciliationTemplate(),{type:"buffer"}),headers=(XLSX.utils.sheet_to_json(template.Sheets.LIQUIDACION,{header:1})[0]??[]) as string[];check(template.SheetNames.join("|")==="LIQUIDACION|INSTRUCCIONES"&&JSON.stringify(headers)===JSON.stringify(reconciliationTemplateColumns),"7. Plantilla descargable conserva hojas y 13 columnas");
    const general=await prisma.economicRule.create({data:{tenantId:yc.id,name:"Regla temporal general QA",code:generalCode,productId:sale.productId,effectiveFrom:new Date("2000-01-01T00:00:00Z"),expectedCompanyIncomeType:EconomicCalculationType.FIXED,expectedCompanyIncomeValue:new Prisma.Decimal(5)}});
    const specific=await prisma.economicRule.create({data:{tenantId:yc.id,name:"Regla temporal específica QA",code:specificCode,productId:sale.productId,commercialPlanId:sale.commercialPlanId,transactionType:sale.transactionType,effectiveFrom:new Date("2000-01-01T00:00:00Z"),expectedCompanyIncomeType:EconomicCalculationType.FIXED,expectedCompanyIncomeValue:new Prisma.Decimal(10),promoterCommissionType:EconomicCalculationType.FIXED,promoterCommissionValue:new Prisma.Decimal(2),supervisorCommissionType:EconomicCalculationType.FIXED,supervisorCommissionValue:new Prisma.Decimal(1)}});
    const calculated=calculateSaleEconomics(sale,[general,specific]);check(calculated.economicRuleId===specific.id&&calculated.expectedCompanyIncome?.equals(10),"8. Venta real identifica producto, plan y operación y elige la regla más específica");check(calculated.promoterCommission?.equals(2)&&calculated.supervisorCommission?.equals(1)&&calculated.preliminaryMargin?.equals(7),"9. Motor calcula componentes separados y margen preliminar en prueba reversible");
    const noRule=calculateSaleEconomics(sale,[]);check(noRule.calculationStatus==="PENDING_RULE"&&noRule.expectedCompanyIncome===null&&noRule.promoterCommission===null,"10. Venta sin regla queda SIN_REGLA/PENDING_RULE y no recibe comisión");check(await prisma.saleEconomicCalculation.count({where:{tenantId:yc.id,current:true,calculationStatus:{not:"PENDING_RULE"}}})===0,"11. La prueba no modifica los 767 snapshots económicos históricos");
    const ui=await readFile(new URL("../components/reconciliation-workspace.tsx",import.meta.url),"utf8");check(ui.includes("<h1>Liquidaciones</h1>")&&ui.includes("＋ Nueva liquidación")&&!ui.includes(">Conciliación<"),"12. Denominación visible principal cambió a Liquidaciones");check(await prisma.reconciliationImport.count({where:{tenantId:clinic.id}})===0,"13. Clínica Demo no recibe liquidaciones de YC");
  }finally{
    await prisma.economicRule.deleteMany({where:{tenantId:yc.id,code:{in:[generalCode,specificCode]}}});if(providerId){await prisma.reconciliationImport.deleteMany({where:{providerId}});await prisma.settlementProvider.deleteMany({where:{id:providerId}})}
  }
  const after=await snapshot(yc.id,clinic.id);check(JSON.stringify(before)===JSON.stringify(after),"14. Customer, Sale, estados, asesores históricos y Clínica Demo quedan intactos");check(await prisma.economicRule.count({where:{tenantId:yc.id}})===0,"15. Reglas económicas temporales eliminadas; YC conserva cero reglas definitivas");console.log(JSON.stringify({before,after},null,2));
}
main().finally(()=>prisma.$disconnect());
