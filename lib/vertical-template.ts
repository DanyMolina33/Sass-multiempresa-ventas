import { getPrisma } from "@/lib/prisma";

export const NAVIGABLE_CRM_FEATURES=["leads","customers","sales","follow-ups","products","commercial-plans","commissions","reconciliation","finance","payroll","commercial-management","promoter-space"] as const;
// Views whose data is administrative/economic in nature — active for the tenant is not enough, the session's role
// must also be authorized, matching the same role list already enforced server-side (requireFinanceRead/requirePersonnelRead).
export const RESTRICTED_CRM_VIEWS = ["commissions","reconciliation","finance","payroll","commercial-management"] as const;
export const RESTRICTED_CRM_ROLES = ["SUPER_ADMIN","COMPANY_ADMIN","SUPERVISOR"] as const;

export async function getTenantCrmConfiguration(tenantId:string){return getPrisma().tenantVerticalTemplate.findFirst({where:{tenantId,active:true,verticalTemplate:{active:true,code:"CRM_TELECOM"}},include:{verticalTemplate:{include:{features:{include:{tenantFeatures:{where:{tenantId}}},orderBy:{name:"asc"}}}}}})}
export async function isCrmFeatureActive(tenantId:string,code:string){const assignment=await getTenantCrmConfiguration(tenantId);if(!assignment)return ["leads","customers","sales","follow-ups","products","commercial-plans"].includes(code);return Boolean(assignment.verticalTemplate.features.find(feature=>feature.code===code)?.tenantFeatures.some(item=>item.active))}
export async function getActiveCrmFeatureCodes(tenantId:string){const assignment=await getTenantCrmConfiguration(tenantId);if(!assignment)return [...NAVIGABLE_CRM_FEATURES.slice(0,6)];const active=new Set(assignment.verticalTemplate.features.filter(feature=>feature.tenantFeatures.some(item=>item.active)).map(feature=>feature.code));return NAVIGABLE_CRM_FEATURES.filter(code=>active.has(code))}
export async function getFirstActiveCrmFeature(tenantId:string){return (await getActiveCrmFeatureCodes(tenantId))[0]??null}
export async function requireCrmFeature(tenantId:string,code:string){if(!await isCrmFeatureActive(tenantId,code))throw new Response("Función CRM no activa para esta empresa",{status:403})}
