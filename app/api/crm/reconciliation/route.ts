import { Prisma } from "@prisma/client";
import { crmError, requireCrmContext } from "@/lib/crm-access";
import { parseReconciliationWorkbook, processReconciliation } from "@/lib/reconciliation-engine";
import { getPrisma } from "@/lib/prisma";
import { requireReconciliationRead, requireReconciliationWrite } from "@/lib/reconciliation-access";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function GET(request:Request){try{
  const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"reconciliation");requireReconciliationRead(context.role);
  const search=new URL(request.url).searchParams,status=search.get("status")||undefined,period=search.get("period")||undefined,providerId=search.get("providerId")||undefined,term=search.get("search")||undefined,productId=search.get("productId")||undefined,commercialPlanId=search.get("commercialPlanId")||undefined,transactionType=search.get("transactionType")||undefined,advisor=search.get("advisor")||undefined,prisma=getPrisma();
  const importWhere={tenantId:context.tenantId,...(period?{period}:{}),...(providerId?{providerId}: {})};
  const saleFilter:Prisma.SaleWhereInput={...(productId?{productId}:{}),...(commercialPlanId?{commercialPlanId}:{}),...(transactionType?{transactionType:transactionType as never}:{}),...(advisor?{historicalAdvisorName:advisor}:{}),...(term?{OR:[{customerDocumentSnapshot:{contains:term,mode:"insensitive"}},{customerNameSnapshot:{contains:term,mode:"insensitive"}},{msisdn:{contains:term,mode:"insensitive"}},{sec:{contains:term,mode:"insensitive"}},{sot:{contains:term,mode:"insensitive"}},{customer:{phone:{contains:term,mode:"insensitive"}}}]}:{})};
  const resultWhere:Prisma.ReconciliationResultWhereInput={tenantId:context.tenantId,...(status?{status:status as never}:{}),reconciliation:importWhere,...(Object.keys(saleFilter).length?{sale:saleFilter}:{})};
  const[imports,results,sales,sums,counts,historyGroups]=await Promise.all([
    prisma.reconciliationImport.findMany({where:importWhere,include:{provider:true,uploadedBy:{select:{name:true,email:true}}},orderBy:{uploadedAt:"desc"}}),
    prisma.reconciliationResult.findMany({where:resultWhere,include:{reconciliation:{include:{provider:true}},sale:{select:{id:true,saleDate:true,customerNameSnapshot:true,customerDocumentSnapshot:true,productNameSnapshot:true,planNameSnapshot:true,transactionType:true,sec:true,sot:true,msisdn:true,historicalAdvisorName:true,customer:{select:{phone:true}}}}},orderBy:{createdAt:"desc"},take:100}),
    prisma.sale.count({where:{tenantId:context.tenantId}}),
    prisma.reconciliationResult.aggregate({where:resultWhere,_sum:{expectedAmount:true,recognizedAmount:true,differenceAmount:true}}),
    prisma.reconciliationResult.groupBy({by:["status"],where:{tenantId:context.tenantId,reconciliation:importWhere},_count:{_all:true}}),
    prisma.reconciliationResult.groupBy({by:["reconciliationId","status"],where:{tenantId:context.tenantId,reconciliation:importWhere},_count:{_all:true},_sum:{recognizedAmount:true,differenceAmount:true}}),
  ]);
  const history=imports.map(item=>{const groups=historyGroups.filter(group=>group.reconciliationId===item.id),count=(value:string)=>groups.find(group=>group.status===value)?._count._all??0,sum=(field:"recognizedAmount"|"differenceAmount")=>groups.reduce((total,group)=>total.add(group._sum[field]??0),new Prisma.Decimal(0));return{...item,metrics:{recognized:count("CONFORME")+count("DIFERENCIA")+count("PENDIENTE"),conforme:count("CONFORME"),difference:count("DIFERENCIA"),notFound:count("NO_ENCONTRADO")+item.externalOnlyCount,notSettled:count("NO_LIQUIDADO"),recognizedAmount:sum("recognizedAmount"),differenceAmount:sum("differenceAmount")}}});
  return Response.json({imports:history,results,summary:{sales,counts:Object.fromEntries(counts.map(item=>[item.status,item._count._all])),expected:sums._sum.expectedAmount,recognized:sums._sum.recognizedAmount,difference:sums._sum.differenceAmount}});
}catch(error){return crmError(error)}}

export async function POST(request:Request){try{
  const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"reconciliation");requireReconciliationWrite(context.role);
  const form=await request.formData(),providerId=String(form.get("providerId")??""),period=String(form.get("period")??""),settlementDate=String(form.get("settlementDate")??""),file=form.get("file");
  if(!(file instanceof File)||!providerId||!period||!settlementDate)throw new Response("Empresa proveedora, periodo, fecha y archivo Excel son obligatorios",{status:400});
  if(!/\.xlsx?$/i.test(file.name))throw new Response("El archivo debe ser Excel (.xlsx o .xls)",{status:400});
  if(!await getPrisma().settlementProvider.findFirst({where:{id:providerId,tenantId:context.tenantId,active:true}}))throw new Response("Empresa proveedora fuera del tenant o inactiva",{status:403});
  const buffer=Buffer.from(await file.arrayBuffer());if(buffer.length>15*1024*1024)throw new Response("El archivo supera 15 MB",{status:413});
  const parsed=parseReconciliationWorkbook(buffer);if(!parsed.rows.length)throw new Response("El archivo no contiene operaciones para liquidar",{status:400});
  const item=await processReconciliation({tenantId:context.tenantId,providerId,period,settlementDate:new Date(`${settlementDate}T00:00:00Z`),originalFileName:file.name,fileHash:parsed.fileHash,notes:String(form.get("notes")??"")||null,uploadedByUserId:context.userId,detectedColumns:parsed.detectedColumns,rows:parsed.rows});
  return Response.json({item},{status:201});
}catch(error){return crmError(error)}}
