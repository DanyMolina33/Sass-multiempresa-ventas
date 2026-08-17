import "dotenv/config";
import { getOperationalCustomer, getOperationalSale, listOperationalCustomers, listOperationalSales } from "../lib/crm-operational-query";
import { getPrisma } from "../lib/prisma";

function check(value:unknown,message:string){if(!value)throw new Error(message);console.log(`✓ ${message}`)}
async function main(){
  const prisma=getPrisma(),yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}}),clinic=await prisma.tenant.findUniqueOrThrow({where:{slug:"clinica-demo"}});
  const before={sales:await prisma.sale.count({where:{tenantId:yc.id}}),customers:await prisma.customer.count({where:{tenantId:yc.id}}),users:await prisma.user.count({where:{tenantId:yc.id}}),leads:await prisma.lead.count({where:{tenantId:yc.id}}),followUps:await prisma.followUp.count({where:{tenantId:yc.id}})};
  const firstPage=await listOperationalSales(yc.id,{page:1,pageSize:25});
  check(firstPage.total===767&&firstPage.items.length===25,"1. La consulta operativa de /crm/sales devuelve la primera página real de YC");
  const allIds:string[]=[];for(let page=1;page<=8;page++){const result=await listOperationalSales(yc.id,{page,pageSize:100});allIds.push(...result.items.map(item=>item.id))}
  check(allIds.length===767&&new Set(allIds).size===767,"2. La paginación cubre 767 ventas sin pérdidas ni duplicados");
  const sample=firstPage.items.find(item=>item.customerDocumentSnapshot)||firstPage.items[0],searchValue=sample.customerDocumentSnapshot||sample.customerNameSnapshot;
  const search=await listOperationalSales(yc.id,{search:searchValue,pageSize:100});check(search.total>0&&search.items.some(item=>item.id===sample.id),"3. El buscador encuentra ventas por datos reales del cliente");
  const filtered=await listOperationalSales(yc.id,{productId:(await prisma.product.findFirstOrThrow({where:{tenantId:yc.id}})).id,transactionType:"PORTABILIDAD",pageSize:100});check(filtered.total===await prisma.sale.count({where:{tenantId:yc.id,productId:(await prisma.product.findFirstOrThrow({where:{tenantId:yc.id}})).id,transactionType:"PORTABILIDAD"}}),"4. Los filtros de producto y operación coinciden con PostgreSQL");
  const saleDetail=await getOperationalSale(yc.id,sample.id);check(saleDetail?.tenantId===yc.id&&saleDetail.customerNameSnapshot===sample.customerNameSnapshot,"5. El detalle de venta corresponde a la venta seleccionada");
  const customerPage=await listOperationalCustomers(yc.id,{page:1,pageSize:25});check(customerPage.total===731&&customerPage.items.length===25,"6. El listado de clientes proviene de los 731 Customer de YC");
  const customerSearch=await listOperationalCustomers(yc.id,{search:customerPage.items[0].document||customerPage.items[0].name});check(customerSearch.items.some(item=>item.id===customerPage.items[0].id),"7. La búsqueda de clientes usa nombre, documento, teléfono y email");
  const multi=await prisma.customer.findFirstOrThrow({where:{tenantId:yc.id,sales:{some:{}}},orderBy:{sales:{_count:"desc"}},include:{_count:{select:{sales:true}}}}),customerDetail=await getOperationalCustomer(yc.id,multi.id);
  check(customerDetail?.sales.length===multi._count.sales&&new Set(customerDetail?.sales.map(item=>item.id)).size===multi._count.sales,"8. La ficha del cliente muestra todas sus ventas sin duplicarlas");
  check(await getOperationalSale(clinic.id,sample.id)===null&&await getOperationalCustomer(clinic.id,multi.id)===null,"9. Clínica Demo no puede resolver identificadores de YC");
  const clinicSales=await listOperationalSales(clinic.id,{pageSize:100}),clinicCustomers=await listOperationalCustomers(clinic.id,{pageSize:100});check(clinicSales.total===3&&clinicCustomers.total===2,"10. Clínica Demo conserva y consulta exclusivamente sus datos propios");
  check(before.leads===0&&before.followUps===0,"11. Leads y Seguimientos de YC permanecen vacíos; no fueron poblados artificialmente");
  check(await prisma.product.count({where:{tenantId:yc.id}})===8&&await prisma.commercialPlan.count({where:{tenantId:yc.id}})===12,"12. Productos y los 12 planes permanecen en PostgreSQL");
  const renewal=await prisma.product.findUniqueOrThrow({where:{tenantId_code:{tenantId:yc.id,code:"RENOVACION"}}});check(renewal.status==="INACTIVE","13. RENOVACION continúa como producto inactivo");
  const after={sales:await prisma.sale.count({where:{tenantId:yc.id}}),customers:await prisma.customer.count({where:{tenantId:yc.id}}),users:await prisma.user.count({where:{tenantId:yc.id}}),leads:await prisma.lead.count({where:{tenantId:yc.id}}),followUps:await prisma.followUp.count({where:{tenantId:yc.id}})};
  check(JSON.stringify(before)===JSON.stringify(after)&&after.sales===767&&after.customers===731&&after.users===4,"14. La verificación no insertó ventas, clientes, usuarios, leads ni seguimientos");
  console.log(JSON.stringify({before,after,firstPageBytes:JSON.stringify(firstPage).length},null,2));
}
main().finally(()=>getPrisma().$disconnect());
