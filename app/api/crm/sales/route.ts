import { assignedScope, crmError, resolveScopedTeamUserIds, requireCrmContext, validateAssignableUser } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireCrmFeature } from "@/lib/vertical-template";
import { listOperationalSales } from "@/lib/crm-operational-query";
import { calculateAndSnapshotSale } from "@/lib/economic-engine";

export async function GET(request:Request) {
  try { const context=await requireCrmContext(); await requireCrmFeature(context.tenantId,"sales"); const search=new URL(request.url).searchParams;const teamUserIds=await resolveScopedTeamUserIds(context,search.get("scope"));return Response.json(await listOperationalSales(context.tenantId,{page:Number(search.get("page")||1),pageSize:Number(search.get("pageSize")||25),search:search.get("search")||undefined,dateFrom:search.get("dateFrom")||undefined,dateTo:search.get("dateTo")||undefined,productId:search.get("productId")||undefined,commercialPlanId:search.get("commercialPlanId")||undefined,transactionType:search.get("transactionType")||undefined,status:search.get("status")||undefined,historicalAdvisorName:search.get("historicalAdvisorName")||undefined},teamUserIds,context.storeId)); } catch(error){return crmError(error)}
}

export async function POST(request:Request){
  try{
    const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"sales");const body=await request.json();const prisma=getPrisma();
    const customer=await prisma.customer.findFirst({where:{id:body.customerId,tenantId:context.tenantId,...assignedScope(context,"ownerUserId")}});if(!customer)throw new Response("Cliente de otro tenant o fuera de alcance",{status:403});
    const product=await prisma.product.findFirst({where:{id:body.productId,tenantId:context.tenantId,status:"ACTIVE"}});if(!product)throw new Response("Producto de otro tenant",{status:403});
    const commercialPlan=body.commercialPlanId?await prisma.commercialPlan.findFirst({where:{id:body.commercialPlanId,tenantId:context.tenantId}}):null;if(body.commercialPlanId&&!commercialPlan)throw new Response("Plan comercial de otro tenant",{status:403});if(commercialPlan&&commercialPlan.productId!==product.id)throw new Response("El plan comercial no corresponde al producto seleccionado",{status:400});
    const lead=body.leadId?await prisma.lead.findFirst({where:{id:body.leadId,tenantId:context.tenantId,...assignedScope(context,"assignedUserId")}}):null;if(body.leadId&&!lead)throw new Response("Lead de otro tenant o fuera de alcance",{status:403});
    // A SUPERVISOR is also a vendedor (section 15): registering a sale for themselves (no agentId, or agentId ===
    // their own id) must succeed even though their own role isn't AGENT — but assigning to someone ELSE still
    // requires that target to be a real AGENT subordinate, unchanged from before.
    const requestedAgentId=context.role==="AGENT"?context.userId:(body.agentId||context.userId);
    const isSelfSale=context.role==="SUPERVISOR"&&requestedAgentId===context.userId;
    const agent=isSelfSale?await prisma.user.findFirst({where:{id:context.userId,tenantId:context.tenantId,status:"ACTIVE"},include:{role:true}}):await validateAssignableUser(context,requestedAgentId);
    if(!agent)throw new Response("Usuario no válido",{status:403});
    if(!isSelfSale&&agent.role.code!=="AGENT")throw new Response("El promotor debe tener rol AGENT",{status:400});
    const supervisor=agent.supervisorId?await prisma.user.findFirst({where:{id:agent.supervisorId,tenantId:context.tenantId,status:"ACTIVE",role:{code:"SUPERVISOR"}}}):null;if(agent.supervisorId&&!supervisor)throw new Response("Supervisor inválido para la jerarquía",{status:403});
    // Store is never client-selectable for an AGENT, nor for a SUPERVISOR registering their OWN sale — both derive
    // it from their own Employee assignment (instruction: "NO seleccionable manualmente"). A SUPERVISOR assigning a
    // sale to one of their AGENT subordinates may still pass one explicitly; empresas sin sucursales simplemente nunca la envían.
    const requestedStoreId=(context.role==="AGENT"||isSelfSale)?(await prisma.employee.findFirst({where:{tenantId:context.tenantId,userId:context.userId},select:{storeId:true}}))?.storeId??null:(body.storeId||null);
    const store=requestedStoreId?await prisma.store.findFirst({where:{id:requestedStoreId,tenantId:context.tenantId}}):null;if(requestedStoreId&&!store)throw new Response("Tienda de otro tenant",{status:403});
    const sale=await prisma.$transaction(async tx=>{
      const created=await tx.sale.create({data:{tenantId:context.tenantId,leadId:lead?.id,customerId:customer.id,productId:product.id,commercialPlanId:commercialPlan?.id,agentId:agent.id,supervisorId:supervisor?.id,storeId:store?.id,transactionType:body.transactionType,saleDate:body.saleDate?new Date(body.saleDate):new Date(),sec:body.sec||null,sot:body.sot||null,msisdn:body.msisdn||null,customerDocumentSnapshot:customer.document,customerNameSnapshot:customer.name,productNameSnapshot:product.name,planNameSnapshot:commercialPlan?.name,fixedChargeSnapshot:commercialPlan?.fixedCharge,saleAmount:body.saleAmount||commercialPlan?.price,salesChannel:body.salesChannel||null,pointOfSale:body.pointOfSale||null,source:body.source||null,notes:body.notes||null,createdByUserId:context.userId,statusHistory:{create:{tenantId:context.tenantId,newStatus:"REGISTRADA",changedByUserId:context.userId}}}});
      if(lead){const stage=await tx.pipelineStage.findUnique({where:{tenantId_code:{tenantId:context.tenantId,code:"VENTA_REGISTRADA"}}});if(stage){await tx.lead.update({where:{id:lead.id},data:{pipelineStageId:stage.id}});await tx.leadStageHistory.create({data:{tenantId:context.tenantId,leadId:lead.id,pipelineStageId:stage.id,changedByUserId:context.userId}})}}return created});
    await calculateAndSnapshotSale(sale.id,context.tenantId);
    return Response.json({item:sale},{status:201});
  }catch(error){return crmError(error)}
}
