import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { getTenantCrmConfiguration } from "@/lib/vertical-template";

export async function GET(){try{const context=await requireCrmContext(),prisma=getPrisma();const[products,commercialPlans,configuration]=await Promise.all([prisma.product.findMany({where:{tenantId:context.tenantId},select:{id:true,name:true},orderBy:{name:"asc"}}),prisma.commercialPlan.findMany({where:{tenantId:context.tenantId},select:{id:true,name:true,productId:true},orderBy:{name:"asc"}}),getTenantCrmConfiguration(context.tenantId)]);const activeFeatures=configuration?configuration.verticalTemplate.features.filter(feature=>feature.tenantFeatures.some(item=>item.active)).map(feature=>feature.code):["leads","customers","sales","follow-ups","products","commercial-plans"];return Response.json({products,commercialPlans,activeFeatures})}catch(error){return crmError(error)}}
