import { crmError, requireCrmContext } from "@/lib/crm-access";
import { getPrisma } from "@/lib/prisma";
import { requireReconciliationRead } from "@/lib/reconciliation-access";
import { buildReconciliationTemplate, reconciliationTemplateFileName } from "@/lib/reconciliation-template";
import { requireCrmFeature } from "@/lib/vertical-template";

export async function GET(){try{const context=await requireCrmContext();await requireCrmFeature(context.tenantId,"reconciliation");requireReconciliationRead(context.role);const tenant=await getPrisma().tenant.findUniqueOrThrow({where:{id:context.tenantId},select:{name:true}}),output=buildReconciliationTemplate(),filename=reconciliationTemplateFileName(tenant.name);return new Response(output,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}})}catch(error){return crmError(error)}}
