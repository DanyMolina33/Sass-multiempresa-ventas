import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type OperationalQuery={page?:number;pageSize?:number;search?:string;dateFrom?:string;dateTo?:string;productId?:string;commercialPlanId?:string;transactionType?:string;status?:string;historicalAdvisorName?:string};
function pagination(query:OperationalQuery){const page=Math.max(1,Math.trunc(Number(query.page)||1)),pageSize=Math.min(100,Math.max(10,Math.trunc(Number(query.pageSize)||25)));return{page,pageSize,skip:(page-1)*pageSize}}
function dateStart(value?:string){if(!value)return undefined;const date=new Date(`${value.slice(0,10)}T00:00:00.000Z`);return Number.isNaN(date.getTime())?undefined:date}
function dateEnd(value?:string){if(!value)return undefined;const date=new Date(`${value.slice(0,10)}T23:59:59.999Z`);return Number.isNaN(date.getTime())?undefined:date}

export async function listOperationalSales(tenantId:string,query:OperationalQuery,teamUserIds:string[]|null=null,storeId:string|null=null){
  const{page,pageSize,skip}=pagination(query),search=query.search?.trim();
  const where:Prisma.SaleWhereInput={tenantId,...(teamUserIds?{agentId:{in:teamUserIds}}:{}),...(storeId?{storeId}:{}),...(search?{OR:[{customerNameSnapshot:{contains:search,mode:"insensitive"}},{customerDocumentSnapshot:{contains:search,mode:"insensitive"}},{msisdn:{contains:search,mode:"insensitive"}},{sec:{contains:search,mode:"insensitive"}},{sot:{contains:search,mode:"insensitive"}},{customer:{phone:{contains:search,mode:"insensitive"}}}]}:{}),...((query.dateFrom||query.dateTo)?{saleDate:{...(dateStart(query.dateFrom)?{gte:dateStart(query.dateFrom)}:{}),...(dateEnd(query.dateTo)?{lte:dateEnd(query.dateTo)}:{})}}:{}),...(query.productId?{productId:query.productId}:{}),...(query.commercialPlanId?{commercialPlanId:query.commercialPlanId}:{}),...(query.transactionType?{transactionType:query.transactionType as never}:{}),...(query.status?{status:query.status as never}:{}),...(query.historicalAdvisorName?{historicalAdvisorName:query.historicalAdvisorName}:{})};
  const prisma=getPrisma();
  const[items,total,advisorRows]=await Promise.all([prisma.sale.findMany({where,select:{id:true,saleDate:true,status:true,transactionType:true,customerNameSnapshot:true,customerDocumentSnapshot:true,productNameSnapshot:true,planNameSnapshot:true,msisdn:true,sec:true,sot:true,historicalAdvisorName:true,historicalSupervisorName:true,customer:{select:{phone:true}},agent:{select:{id:true,name:true}}},orderBy:[{saleDate:"desc"},{id:"asc"}],skip,take:pageSize}),prisma.sale.count({where}),prisma.sale.findMany({where:{tenantId,historicalAdvisorName:{not:null}},distinct:["historicalAdvisorName"],select:{historicalAdvisorName:true},orderBy:{historicalAdvisorName:"asc"}})]);
  return{items,total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize)),facets:{historicalAdvisors:advisorRows.flatMap(item=>item.historicalAdvisorName?[item.historicalAdvisorName]:[])}};
}

export async function listOperationalCustomers(tenantId:string,query:OperationalQuery,teamUserIds:string[]|null=null){
  const{page,pageSize,skip}=pagination(query),search=query.search?.trim();
  const scope:Prisma.CustomerWhereInput={tenantId,...(teamUserIds?{ownerUserId:{in:teamUserIds}}:{})};
  const saleScope:Prisma.SaleWhereInput={tenantId,...(teamUserIds?{agentId:{in:teamUserIds}}:{})};
  const where:Prisma.CustomerWhereInput={...scope,...(search?{OR:[{name:{contains:search,mode:"insensitive"}},{document:{contains:search,mode:"insensitive"}},{phone:{contains:search,mode:"insensitive"}},{email:{contains:search,mode:"insensitive"}}]}:{})};
  const prisma=getPrisma();
  const now=new Date(),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
  const[items,total,totalCustomers,totalSales,approvedSales,monthSales]=await Promise.all([prisma.customer.findMany({where,select:{id:true,name:true,document:true,phone:true,email:true,status:true,createdAt:true,ownerUser:{select:{id:true,name:true}},_count:{select:{sales:true}},sales:{select:{saleDate:true,productNameSnapshot:true,planNameSnapshot:true,status:true},orderBy:{saleDate:"desc"},take:1}},orderBy:[{name:"asc"},{id:"asc"}],skip,take:pageSize}),prisma.customer.count({where}),prisma.customer.count({where:scope}),prisma.sale.count({where:saleScope}),prisma.sale.count({where:{...saleScope,status:"APROBADA"}}),prisma.sale.count({where:{...saleScope,saleDate:{gte:monthStart,lt:nextMonth}}})]);
  return{items:items.map(item=>({...item,lastSale:item.sales[0]??null,sales:undefined})),total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize)),summary:{customers:totalCustomers,sales:totalSales,approvedSales,monthSales}};
}

export async function getOperationalCustomer(tenantId:string,id:string,teamUserIds:string[]|null=null){
  return getPrisma().customer.findFirst({
    where:{id,tenantId,...(teamUserIds?{ownerUserId:{in:teamUserIds}}:{})},
    include:{ownerUser:{select:{id:true,name:true}},sales:{select:{id:true,saleDate:true,productNameSnapshot:true,planNameSnapshot:true,transactionType:true,status:true,sec:true,sot:true,msisdn:true,historicalAdvisorName:true},orderBy:[{saleDate:"desc"},{id:"asc"}]}}
  });
}

export async function getOperationalSale(tenantId:string,id:string,teamUserIds:string[]|null=null,storeId:string|null=null){return getPrisma().sale.findFirst({where:{id,tenantId,...(teamUserIds?{agentId:{in:teamUserIds}}:{}),...(storeId?{storeId}:{})},include:{customer:true,product:true,commercialPlan:true,lead:{select:{id:true,name:true}},agent:{select:{id:true,name:true}},supervisor:{select:{id:true,name:true}},statusHistory:{include:{changedByUser:{select:{name:true}}},orderBy:{changedAt:"desc"}}}})}
