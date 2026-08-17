import { randomUUID } from "node:crypto";
import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { requireReconciliationRead, requireReconciliationWrite } from "@/lib/reconciliation-access";

export async function GET(){try{const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"reconciliation");requireReconciliationRead(context.role);return Response.json({items:await getPrisma().settlementProvider.findMany({where:{tenantId:context.tenantId},orderBy:{name:"asc"}})})}catch(error){return crmError(error)}}
export async function POST(request:Request){try{
  const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"reconciliation");requireReconciliationWrite(context.role);
  const body=await request.json(),name=String(body.name??"").trim(),legalName=String(body.legalName??"").trim()||null,providedCode=String(body.code??"").trim().toUpperCase(),code=providedCode||`PROV_${randomUUID().slice(0,8).toUpperCase()}`;
  if(!name)throw new Response("Nombre comercial obligatorio",{status:400});
  const item=await getPrisma().settlementProvider.create({data:{tenantId:context.tenantId,name,legalName,code,active:body.active!==false}});
  return Response.json({item},{status:201});
}catch(error){return crmError(error)}}
