import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl=process.env.APP_URL??"http://localhost:3001",password=process.env.DEMO_PASSWORD;
if(!process.env.DATABASE_URL||!password)throw new Error("Entorno incompleto");
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
async function login(email:string,tenantSlug?:string){const response=await fetch(`${baseUrl}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,tenantSlug})});return{response,cookie:response.headers.get("set-cookie")?.split(";")[0]??""}}
async function main(){let reportsModuleId="";try{
  const yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"},include:{branding:true,modules:{include:{module:true}}}});assert.ok(yc.branding);assert.equal(yc.branding.displayName,"YC Telecomunicaciones");assert.equal(yc.branding.subdomain,"yc-telecomunicaciones");
  const tenantLogin=await fetch(`${baseUrl}/t/yc-telecomunicaciones/login`);assert.equal(tenantLogin.status,200);const loginHtml=await tenantLogin.text();assert.ok(loginHtml.includes("YC Telecomunicaciones"));assert.ok(loginHtml.includes("YC"));
  const ycLogin=await login("admin@yctelecom.test","yc-telecomunicaciones");assert.equal(ycLogin.response.status,200);const ycSession=(await ycLogin.response.json()) as {session:{user:{tenantId:string;branding:{displayName:string};activeModules:string[]}}};assert.equal(ycSession.session.user.tenantId,yc.id);assert.equal(ycSession.session.user.branding.displayName,"YC Telecomunicaciones");assert.deepEqual(ycSession.session.user.activeModules.sort(),["crm","reportes"]);
  const clinicOnYc=await login("admin@clinicademo.test","yc-telecomunicaciones");assert.equal(clinicOnYc.response.status,401);
  const companyPage=await fetch(`${baseUrl}/empresa`,{headers:{cookie:ycLogin.cookie}});assert.equal(companyPage.status,200);const companyHtml=await companyPage.text();for(const text of ["YC Telecomunicaciones","Dashboard","Usuarios","CRM","Reportes"])assert.ok(companyHtml.includes(text),`Falta ${text}`);
  for(const hidden of ["Call Center","SMS Center","WhatsApp","Guardian"])assert.equal(companyHtml.includes(`>${hidden}<`),false,`${hidden} apareció en el menú`);assert.equal(companyHtml.includes("Clínica Demo"),false);
  const inactiveRoute=await fetch(`${baseUrl}/call-center`,{headers:{cookie:ycLogin.cookie},redirect:"manual"});assert.ok([307,308].includes(inactiveRoute.status));assert.equal(new URL(inactiveRoute.headers.get("location")!,baseUrl).pathname,"/empresa");
  const superLogin=await login("superadmin@mentorify.test");assert.equal(superLogin.response.status,200);const master=await fetch(`${baseUrl}/`,{headers:{cookie:superLogin.cookie}});assert.ok((await master.text()).includes("MentoriFY"));
  const deniedBranding=await fetch(`${baseUrl}/api/core/tenants/${yc.id}/branding`,{method:"PATCH",headers:{cookie:ycLogin.cookie,"Content-Type":"application/json"},body:JSON.stringify({displayName:"No permitido"})});assert.equal(deniedBranding.status,403);
  const savedBranding=await fetch(`${baseUrl}/api/core/tenants/${yc.id}/branding`,{method:"PATCH",headers:{cookie:superLogin.cookie,"Content-Type":"application/json"},body:JSON.stringify({...yc.branding,displayName:"YC Telecomunicaciones"})});assert.equal(savedBranding.status,200);
  const reports=yc.modules.find(item=>item.module.code==="reportes")!;reportsModuleId=reports.moduleId;const productsBefore=await prisma.product.count({where:{tenantId:yc.id}});
  const disable=await fetch(`${baseUrl}/api/core/tenants/${yc.id}/modules`,{method:"PATCH",headers:{cookie:superLogin.cookie,"Content-Type":"application/json"},body:JSON.stringify({moduleId:reports.moduleId,enabled:false})});assert.equal(disable.status,200);assert.equal(await prisma.product.count({where:{tenantId:yc.id}}),productsBefore);
  const directReports=await fetch(`${baseUrl}/reportes`,{headers:{cookie:ycLogin.cookie},redirect:"manual"});assert.ok([307,308].includes(directReports.status));
  const enable=await fetch(`${baseUrl}/api/core/tenants/${yc.id}/modules`,{method:"PATCH",headers:{cookie:superLogin.cookie,"Content-Type":"application/json"},body:JSON.stringify({moduleId:reports.moduleId,enabled:true})});assert.equal(enable.status,200);assert.equal(await prisma.product.count({where:{tenantId:yc.id}}),productsBefore);
  console.log(JSON.stringify({tenantBranding:true,tenantSlugResolution:true,ycLoginUrl:`${baseUrl}/t/yc-telecomunicaciones/login`,ycBrandingVisible:true,crossTenantSlugLoginDenied:true,sessionTenantIsSourceOfTruth:true,superAdminMentorifyPreserved:true,superAdminManagesBranding:true,companyAdminBrandingDenied:true,activeMenu:["Dashboard","Usuarios","CRM","Reportes"],inactiveModulesRejected:true,moduleTogglePreservesData:true},null,2));
 }finally{if(reportsModuleId){const yc=await prisma.tenant.findUnique({where:{slug:"yc-telecomunicaciones"}});if(yc)await prisma.tenantModule.updateMany({where:{tenantId:yc.id,moduleId:reportsModuleId},data:{enabled:true}})}await prisma.$disconnect()}}
main().catch(error=>{console.error(error);process.exitCode=1});
