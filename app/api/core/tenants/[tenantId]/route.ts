import { NextResponse } from "next/server";
import { isSuperAdmin, requireSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { slugify } from "@/lib/core-data";
export async function PATCH(request:Request,{params}:{params:Promise<{tenantId:string}>}){try{const session=await requireSession();if(!isSuperAdmin(session))throw new Response("Solo SUPER_ADMIN puede editar empresas",{status:403});const{tenantId}=await params,body=await request.json() as {name?:string;slug?:string;status?:"ACTIVE"|"SUSPENDED"|"INACTIVE"};const tenant=await getPrisma().tenant.update({where:{id:tenantId},data:{name:body.name?.trim(),slug:body.slug?slugify(body.slug):undefined,status:body.status}});return NextResponse.json({tenant})}catch(error){if(error instanceof Response)return NextResponse.json({message:(await error.text())||"Acceso denegado"},{status:error.status});return NextResponse.json({message:"No se pudieron actualizar los datos generales."},{status:400})}}
