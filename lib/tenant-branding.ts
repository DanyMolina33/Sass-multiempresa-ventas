import { getPrisma } from "@/lib/prisma";

export const DEFAULT_BRANDING = { displayName: "MentoriFY", logoUrl: null as string | null, logoDarkUrl: null as string | null, faviconUrl: null as string | null, primaryColor: null as string | null, secondaryColor: null as string | null, loginTitle: null as string | null, loginSubtitle: null as string | null, loginBackgroundUrl: null as string | null, subdomain: null as string | null, customDomain: null as string | null };
export function brandingInitials(name: string) { return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
export async function resolveTenantBySlug(slug: string) { return getPrisma().tenant.findFirst({ where: { status: "ACTIVE", OR: [{ slug }, { branding: { subdomain: slug } }] }, include: { branding: true } }); }
