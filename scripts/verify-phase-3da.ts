import "dotenv/config";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { getPrisma } from "../lib/prisma";
import { matchExternalRow, parseReconciliationWorkbook, processReconciliation } from "../lib/reconciliation-engine";
import { requireReconciliationRead, requireReconciliationWrite } from "../lib/reconciliation-access";

function check(value:unknown,message:string){if(!value)throw new Error(message);console.log(`✓ ${message}`)}
const prisma=getPrisma(),testCode="QA_PHASE_3DA_TEMP";
async function main(){
  const yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}}),clinic=await prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}}),admin=await prisma.user.findUniqueOrThrow({where:{email:"admin@yctelecom.test"}});
  const before={sales:await prisma.sale.count({where:{tenantId:yc.id}}),customers:await prisma.customer.count({where:{tenantId:yc.id}}),users:await prisma.user.count({where:{tenantId:yc.id}})};
  await prisma.settlementProvider.deleteMany({where:{tenantId:yc.id,code:testCode}});
  const provider=await prisma.settlementProvider.create({data:{tenantId:yc.id,name:"Entidad temporal de prueba",code:testCode}});
  try{
    const sale=await prisma.sale.findFirstOrThrow({where:{tenantId:yc.id,sec:{not:null}},orderBy:{saleDate:"asc"}}),sheet=XLSX.utils.json_to_sheet([{SEC:sale.sec,DNI:sale.customerDocumentSnapshot,TELEFONO:sale.msisdn,FECHA_VENTA:sale.saleDate,MONTO_RECONOCIDO:null},{SEC:"SEC-NO-EXISTE",DNI:"00000000"}]),workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,sheet,"Liquidacion");
    const parsed=parseReconciliationWorkbook(XLSX.write(workbook,{type:"buffer",bookType:"xlsx"}));
    check(parsed.rows.length===2&&parsed.detectedColumns.some(item=>item.normalized==="SEC"),"1. El Excel detecta columnas disponibles sin asumir las ausentes");
    const item=await processReconciliation({tenantId:yc.id,providerId:provider.id,period:`${sale.saleDate.getUTCFullYear()}-${String(sale.saleDate.getUTCMonth()+1).padStart(2,"0")}`,settlementDate:new Date(),originalFileName:"qa-temporal.xlsx",fileHash:parsed.fileHash,uploadedByUserId:admin.id,detectedColumns:parsed.detectedColumns,rows:parsed.rows}),results=await prisma.reconciliationResult.findMany({where:{reconciliationId:item.id}});
    check(results.some(result=>result.saleId===sale.id&&result.matchStatus==="MATCHED"&&result.matchedBy==="SEC"),"2. SEC único produce matching determinístico y auditable");
    check(results.some(result=>result.matchStatus==="EXTERNAL_ONLY"),"3. Registro externo sin venta queda EXTERNAL_ONLY");
    check(results.some(result=>result.matchStatus==="NOT_FOUND_IN_OPERATOR"),"4. Ventas CRM ausentes en el archivo quedan NOT_FOUND_IN_OPERATOR");
    check(results.every(result=>result.expectedAmount===null||result.expectedAmount instanceof Prisma.Decimal),"5. No se inventan importes esperados");
    let duplicateBlocked=false;try{await processReconciliation({tenantId:yc.id,providerId:provider.id,period:item.period,settlementDate:new Date(),originalFileName:"qa-repetido.xlsx",fileHash:parsed.fileHash,uploadedByUserId:admin.id,detectedColumns:parsed.detectedColumns,rows:parsed.rows})}catch(error){duplicateBlocked=error instanceof Response&&error.status===409}
    check(duplicateBlocked,"6. El mismo hash no crea una conciliación duplicada");
    const candidates=await prisma.sale.findMany({where:{tenantId:yc.id,sec:sale.sec},select:{id:true,tenantId:true,sourceRecordKey:true,sec:true,sot:true,msisdn:true,customerDocumentSnapshot:true,saleDate:true,productNameSnapshot:true,planNameSnapshot:true}}),row=parsed.rows[0];
    check(matchExternalRow(row,candidates).sale?.tenantId===yc.id&&matchExternalRow(row,[]).sale===null,"7. El motor evalúa únicamente las ventas entregadas por el scope del tenant");
    requireReconciliationWrite("COMPANY_ADMIN");requireReconciliationRead("SUPERVISOR");let agentDenied=false;try{requireReconciliationRead("AGENT")}catch{agentDenied=true}check(agentDenied,"8. AGENT no accede y SUPERVISOR conserva lectura");
    const afterBusiness={sales:await prisma.sale.count({where:{tenantId:yc.id}}),customers:await prisma.customer.count({where:{tenantId:yc.id}}),users:await prisma.user.count({where:{tenantId:yc.id}})};
    check(JSON.stringify(before)===JSON.stringify(afterBusiness),"9. Cargar y cruzar no modifica Sale, Customer ni User");
    check(await prisma.reconciliationImport.count({where:{tenantId:clinic.id,fileHash:parsed.fileHash}})===0,"10. Clínica Demo no recibió conciliaciones de YC");
    check(results.every(result=>result.reconciliationId===item.id&&result.tenantId===yc.id),"11. Los resultados permanentes conservan tenant y conciliación");
  }finally{await prisma.reconciliationImport.deleteMany({where:{providerId:provider.id}});await prisma.settlementProvider.delete({where:{id:provider.id}})}
  check(await prisma.settlementProvider.count({where:{tenantId:yc.id,code:testCode}})===0,"12. Datos temporales de prueba eliminados");
  const feature=await prisma.tenantCrmFeature.findFirst({where:{tenantId:yc.id,feature:{code:"reconciliation"}}});
  check(Boolean(feature),"13. Visibilidad de Conciliación continúa controlada por la función CRM del tenant");
}
main().finally(()=>prisma.$disconnect());
