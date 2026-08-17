import "dotenv/config";
import { getPrisma } from "../lib/prisma";

const prisma=getPrisma();
try{
  const yc=await prisma.tenant.findUniqueOrThrow({where:{slug:"yc-telecomunicaciones"}});
  const items=await prisma.sale.findMany({where:{tenantId:yc.id},include:{customer:true,product:true,commercialPlan:true,lead:{select:{id:true,name:true}},agent:{select:{id:true,name:true}},supervisor:{select:{id:true,name:true}},statusHistory:{include:{changedByUser:{select:{name:true}}},orderBy:{changedAt:"desc"}}},orderBy:{saleDate:"desc"}});
  console.log(JSON.stringify({queried:items.length,serializedBytes:JSON.stringify({items}).length,first:items[0]?.id}));
}catch(error){console.error(error);process.exitCode=1}finally{await prisma.$disconnect()}
