import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl=process.env.APP_URL??"http://localhost:3001";const password=process.env.DEMO_PASSWORD;if(!process.env.DATABASE_URL||!password)throw new Error("Entorno incompleto");const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
async function login(email:string){const response=await fetch(`${baseUrl}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});assert.equal(response.status,200);const cookie=response.headers.get("set-cookie")?.split(";")[0];assert.ok(cookie);return cookie}
async function request(path:string,cookie:string,method="GET",body?:object){return fetch(`${baseUrl}${path}`,{method,headers:{cookie,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined})}

async function main(){let tenantBId:string|undefined;try{
  const clinic=await prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}});const plan=await prisma.plan.findUniqueOrThrow({where:{code:"business"}});const crm=await prisma.module.findUniqueOrThrow({where:{code:"crm"}});
  const tenantB=await prisma.tenant.create({data:{name:"Empresa B CRM QA",slug:`empresa-b-crm-${Date.now()}`,planId:plan.id,modules:{create:{moduleId:crm.id,enabled:true,activatedAt:new Date()}}}});tenantBId=tenantB.id;
  const roleB=await prisma.role.create({data:{tenantId:tenantB.id,code:"AGENT",name:"Agente B",isSystem:true}});const sourceUser=await prisma.user.findUniqueOrThrow({where:{email:"agente@clinicademo.test"}});const userB=await prisma.user.create({data:{tenantId:tenantB.id,roleId:roleB.id,name:"Agente Empresa B",email:`agent-b-${Date.now()}@qa.test`,passwordHash:sourceUser.passwordHash}});
  const stageB=await prisma.pipelineStage.create({data:{tenantId:tenantB.id,name:"Nuevo",code:"NUEVO",order:1}});const leadB=await prisma.lead.create({data:{tenantId:tenantB.id,name:"Lead Empresa B",phone:"999000001",origin:"QA",pipelineStageId:stageB.id,assignedUserId:userB.id}});const customerB=await prisma.customer.create({data:{tenantId:tenantB.id,name:"Cliente Empresa B",phone:"999000002",ownerUserId:userB.id}});const productB=await prisma.product.create({data:{tenantId:tenantB.id,name:"Producto B",code:"PROD-B",category:"QA"}});
  const adminCookie=await login("admin@clinicademo.test");const agentCookie=await login("agente@clinicademo.test");const supervisorCookie=await login("supervisor@clinicademo.test");
  assert.equal((await request(`/api/crm/leads/${leadB.id}`,adminCookie,"PATCH",{name:"Intrusión"})).status,403,"Empresa A editó lead de B");
  assert.equal((await request(`/api/crm/customers/${customerB.id}`,adminCookie,"PATCH",{name:"Intrusión"})).status,403,"Empresa A editó cliente de B");
  const agentLeads=await (await request("/api/crm/leads",agentCookie)).json() as {items:Array<{id:string;assignedUserId:string}>};assert.ok(agentLeads.items.every(item=>item.assignedUserId===sourceUser.id),"AGENT vio leads de otro AGENT");assert.ok(!agentLeads.items.some(item=>item.id==="lead-demo-carlos"),"AGENT vio el lead del segundo promotor");
  const ownLead=await prisma.lead.findFirstOrThrow({where:{tenantId:clinic.id,assignedUserId:sourceUser.id}});assert.equal((await request(`/api/crm/leads/${ownLead.id}`,supervisorCookie,"PATCH",{assignedUserId:userB.id})).status,403,"SUPERVISOR asignó usuario de otro tenant");
  assert.equal((await request("/api/crm/commercial-plans",adminCookie,"POST",{name:"Plan inválido",code:`INVALID-${Date.now()}`,productId:productB.id})).status,403,"Plan comercial aceptó producto de otro tenant");
  assert.equal((await request("/api/crm/follow-ups",adminCookie,"POST",{leadId:leadB.id,assignedUserId:sourceUser.id,scheduledAt:new Date().toISOString(),type:"QA"})).status,403,"Seguimiento aceptó lead de otro tenant");
  assert.equal((await request("/api/crm/follow-ups",adminCookie,"POST",{customerId:customerB.id,assignedUserId:sourceUser.id,scheduledAt:new Date().toISOString(),type:"QA"})).status,403,"Seguimiento aceptó cliente de otro tenant");
  console.log(JSON.stringify({tenantLeadIsolation:true,tenantCustomerIsolation:true,agentScope:true,supervisorAssignmentIsolation:true,crossTenantProductDenied:true,crossTenantFollowUpDenied:true},null,2));
}finally{if(tenantBId)await prisma.tenant.delete({where:{id:tenantBId}});await prisma.$disconnect()}}
main().catch(error=>{console.error(error);process.exitCode=1});
