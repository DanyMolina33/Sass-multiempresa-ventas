import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getPrisma } from "../lib/prisma";
import { getActiveCrmFeatureCodes, getFirstActiveCrmFeature, requireCrmFeature, NAVIGABLE_CRM_FEATURES } from "../lib/vertical-template";

const prisma=getPrisma();
function check(value:unknown,message:string){if(!value)throw new Error(message);console.log(`✓ ${message}`)}
async function main(){
  const yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}}),clinic=await prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}}),features=await prisma.tenantCrmFeature.findMany({where:{tenantId:yc.id},include:{feature:true}}),original=new Map(features.map(item=>[item.featureId,item.active]));
  const counts=async()=>({customers:await prisma.customer.count({where:{tenantId:yc.id}}),sales:await prisma.sale.count({where:{tenantId:yc.id}}),leads:await prisma.lead.count({where:{tenantId:yc.id}}),followUps:await prisma.followUp.count({where:{tenantId:yc.id}}),products:await prisma.product.count({where:{tenantId:yc.id}}),plans:await prisma.commercialPlan.count({where:{tenantId:yc.id}}),rules:await prisma.economicRule.count({where:{tenantId:yc.id}}),liquidations:await prisma.reconciliationImport.count({where:{tenantId:yc.id}}),clinicCustomers:await prisma.customer.count({where:{tenantId:clinic.id}}),clinicSales:await prisma.sale.count({where:{tenantId:clinic.id}})}),before=await counts(),byCode=(code:string)=>features.find(item=>item.feature.code===code)!;
  async function set(code:string,active:boolean){const item=byCode(code);await prisma.tenantCrmFeature.update({where:{tenantId_featureId:{tenantId:yc.id,featureId:item.featureId}},data:{active}})}
  try{
    await Promise.all(features.map(item=>prisma.tenantCrmFeature.update({where:{tenantId_featureId:{tenantId:yc.id,featureId:item.featureId}},data:{active:true}})));
    check(await getFirstActiveCrmFeature(yc.id)==="leads","1. Con Leads activo, /crm resuelve Leads como primera función");
    await set("leads",false);let active=await getActiveCrmFeatureCodes(yc.id);check(!active.includes("leads")&&active.includes("customers")&&active.includes("sales"),"2. Desactivar Leads oculta solo Leads y mantiene Clientes y Ventas");check(await getFirstActiveCrmFeature(yc.id)==="customers","3. Sin Leads, /crm resuelve dinámicamente Clientes");let blocked=false;try{await requireCrmFeature(yc.id,"leads")}catch(error){blocked=error instanceof Response&&error.status===403}check(blocked,"4. Acceso directo a Leads inactivo queda bloqueado");
    await set("customers",false);check(await getFirstActiveCrmFeature(yc.id)==="sales","5. Sin Leads ni Clientes, /crm resuelve Ventas");await set("customers",true);
    await set("commissions",false);active=await getActiveCrmFeatureCodes(yc.id);check(!active.includes("commissions")&&active.includes("sales")&&active.includes("reconciliation"),"6. Desactivar Comisiones no afecta el resto del CRM");
    await set("reconciliation",false);active=await getActiveCrmFeatureCodes(yc.id);check(!active.includes("reconciliation")&&active.includes("sales")&&active.includes("products"),"7. Desactivar Liquidaciones no afecta las demás funciones");blocked=false;try{await requireCrmFeature(yc.id,"reconciliation")}catch(error){blocked=error instanceof Response&&error.status===403}check(blocked,"8. Acceso directo a Liquidaciones inactivas queda bloqueado");
    await set("leads",true);await set("commissions",true);await set("reconciliation",true);check((await getActiveCrmFeatureCodes(yc.id)).includes("leads")&&(await getActiveCrmFeatureCodes(yc.id)).includes("commissions")&&(await getActiveCrmFeatureCodes(yc.id)).includes("reconciliation"),"9. Reactivar funciones las hace reaparecer");
    // Iterates the full NAVIGABLE_CRM_FEATURES list (not a hand-copied subset) so this stays correct as new
    // features are added — a hardcoded 8-of-12 list here previously missed "promoter-space" (added in a later
    // block) and produced a false failure, since a feature this test never touched was still active.
    for(const code of NAVIGABLE_CRM_FEATURES)if(features.some(item=>item.feature.code===code))await set(code,false);check(await getFirstActiveCrmFeature(yc.id)===null,"10. Sin funciones navegables activas se obtiene estado controlado, no ruta circular");
    check(byCode("reconciliation").feature.name==="Liquidaciones","11. Panel Maestro muestra Liquidaciones");
    const indexSource=await readFile(new URL("../app/crm/page.tsx",import.meta.url),"utf8"),viewSource=await readFile(new URL("../app/crm/[view]/page.tsx",import.meta.url),"utf8"),liquidationsSource=await readFile(new URL("../components/reconciliation-workspace.tsx",import.meta.url),"utf8");check(!indexSource.includes('/crm/leads')&&!viewSource.includes('/crm/leads'),"12. Se eliminó la dependencia obligatoria de /crm/leads");check(liquidationsSource.includes('nav.filter(([id])=>meta.activeFeatures.includes(id))'),"13. Liquidaciones también filtra su navegación por funciones activas");
  }finally{await Promise.all(features.map(item=>prisma.tenantCrmFeature.update({where:{tenantId_featureId:{tenantId:yc.id,featureId:item.featureId}},data:{active:original.get(item.featureId)!}})))}
  const after=await counts();check(JSON.stringify(before)===JSON.stringify(after),"14. Desactivar y reactivar funciones no elimina ni modifica datos");check((await getActiveCrmFeatureCodes(yc.id)).length===features.filter(item=>item.active&&(NAVIGABLE_CRM_FEATURES as readonly string[]).includes(item.feature.code)).length,"15. La configuración original de YC quedó restaurada");console.log(JSON.stringify({before,after,active:await getActiveCrmFeatureCodes(yc.id)},null,2));
}
main().finally(()=>prisma.$disconnect());

