import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";
import { roleLandingPath } from "@/lib/role-routes";
import { brandingInitials, resolveTenantBySlug } from "@/lib/tenant-branding";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const{slug}=await params;const tenant=await resolveTenantBySlug(slug);if(!tenant)return{};return{title:tenant.branding?.displayName??tenant.name,icons:tenant.branding?.faviconUrl?{icon:tenant.branding.faviconUrl}:undefined}}
export default async function TenantLoginPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{email?:string}>}){const{slug}=await params;const{email}=await searchParams;const tenant=await resolveTenantBySlug(slug);if(!tenant)notFound();const session=await getSession();if(session)redirect(roleLandingPath(session.user.role.code));const branding=tenant.branding,displayName=branding?.displayName??tenant.name;return <LoginForm tenantSlug={slug} initialEmail={email} branding={{displayName,initials:brandingInitials(displayName),logoUrl:branding?.logoUrl??null,primaryColor:branding?.primaryColor??null,secondaryColor:branding?.secondaryColor??null,loginTitle:branding?.loginTitle??null,loginSubtitle:branding?.loginSubtitle??null,loginBackgroundUrl:branding?.loginBackgroundUrl??null}}/>}
