import "dotenv/config";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createHash, randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { getPrisma } from "../lib/prisma";

const prisma=getPrisma(),token=randomBytes(32).toString("base64url"),tokenHash=createHash("sha256").update(token).digest("hex");
async function request(path:string){const response=await fetch(`http://localhost:3001${path}`,{headers:{cookie:`mentorify_session=${token}`}});const body=await response.json();if(!response.ok)throw new Error(`${path}: HTTP ${response.status} ${JSON.stringify(body)}`);return{status:response.status,body}}
try{
  const user=await prisma.user.findUniqueOrThrow({where:{email:"admin@yctelecom.test"},include:{tenant:true}});
  await prisma.session.create({data:{userId:user.id,tokenHash,expiresAt:new Date(Date.now()+10*60*1000)}});
  const first=await request("/api/crm/sales?page=1&pageSize=25"),sample=first.body.items[0];
  const search=await request(`/api/crm/sales?page=1&pageSize=25&search=${encodeURIComponent(sample.customerDocumentSnapshot||sample.customerNameSnapshot)}`);
  const filter=await request(`/api/crm/sales?page=1&pageSize=25&transactionType=${encodeURIComponent(sample.transactionType)}`);
  const second=await request("/api/crm/sales?page=2&pageSize=25");
  const detail=await request(`/api/crm/sales/${sample.id}`);
  const customers=await request("/api/crm/customers?page=1&pageSize=25");
  const templateResponse=await fetch("http://localhost:3001/api/crm/reconciliation/template",{headers:{cookie:`mentorify_session=${token}`}});if(!templateResponse.ok)throw new Error(`template: HTTP ${templateResponse.status}`);const template=XLSX.read(Buffer.from(await templateResponse.arrayBuffer()),{type:"buffer"});
  console.log(JSON.stringify({authenticatedAs:user.email,tenantSlug:user.tenant?.slug,first:{status:first.status,total:first.body.total,items:first.body.items.length,page:first.body.page,pageSize:first.body.pageSize,totalPages:first.body.totalPages},search:{status:search.status,total:search.body.total,containsSample:search.body.items.some((item:{id:string})=>item.id===sample.id)},filter:{status:filter.status,operation:sample.transactionType,total:filter.body.total,allMatch:filter.body.items.every((item:{transactionType:string})=>item.transactionType===sample.transactionType)},second:{status:second.status,page:second.body.page,items:second.body.items.length,overlap:second.body.items.some((item:{id:string})=>first.body.items.some((firstItem:{id:string})=>first.body.items.some((nested:{id:string})=>nested.id===item.id)))},detail:{status:detail.status,id:detail.body.item.id,customer:detail.body.item.customerNameSnapshot},customers:{status:customers.status,total:customers.body.total,items:customers.body.items.length,summary:customers.body.summary},template:{status:templateResponse.status,fileName:templateResponse.headers.get("content-disposition"),sheets:template.SheetNames}},null,2));
}finally{await prisma.session.deleteMany({where:{tokenHash}});await prisma.$disconnect()}
