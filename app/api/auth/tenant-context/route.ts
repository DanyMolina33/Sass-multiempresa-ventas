import { NextRequest, NextResponse } from "next/server";
import { getSelectedTenant, isSuperAdmin, requireSession, setSelectedTenant } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  try { const session=await requireSession(); if(!isSuperAdmin(session)) return NextResponse.json({tenant:session.user.tenant?{id:session.user.tenant.id,name:session.user.tenant.name}:null}); return NextResponse.json({tenant:await getSelectedTenant()}); } catch { return NextResponse.json({message:"No autenticado"},{status:401}); }
}

export async function POST(request:NextRequest) {
  try { const session=await requireSession(); if(!isSuperAdmin(session)) return NextResponse.json({message:"Solo SUPER_ADMIN puede cambiar el contexto de tenant."},{status:403}); const body=await request.json() as {tenantId?:string|null}; if(!body.tenantId){await setSelectedTenant(null);return NextResponse.json({tenant:null})} const tenant=await getPrisma().tenant.findUnique({where:{id:body.tenantId},select:{id:true,name:true,slug:true,status:true}}); if(!tenant||tenant.status!=="ACTIVE") return NextResponse.json({message:"Tenant inexistente, inválido o inactivo."},{status:404}); await setSelectedTenant(tenant.id); return NextResponse.json({tenant}); } catch(error){console.error("Tenant context failed",error);return NextResponse.json({message:"No fue posible seleccionar la empresa."},{status:400})}
}
