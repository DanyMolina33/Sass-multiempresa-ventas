import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The short link only ever resolves tenant + email and forwards to the real tenant login form — it never
// authenticates by itself (no session is created here), so it carries no more risk than handing someone a URL.
export default async function ShortAccessPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getPrisma().user.findUnique({
    where: { accessCode: code },
    select: { email: true, status: true, tenant: { select: { slug: true, branding: { select: { subdomain: true } } } } },
  });

  if (!user || !user.tenant) return <main className="login-page"><section className="login-panel"><div className="login-copy"><span className="eyebrow">ACCESO SEGURO</span><h1>Enlace no válido</h1><p>Este enlace de acceso no existe o ya no está disponible. Pide a tu administrador uno nuevo.</p></div></section></main>;
  if (user.status !== "ACTIVE") return <main className="login-page"><section className="login-panel"><div className="login-copy"><span className="eyebrow">ACCESO SEGURO</span><h1>Acceso desactivado</h1><p>Tu acceso se encuentra desactivado. Contacta a tu administrador.</p></div></section></main>;

  const slug = user.tenant.branding?.subdomain || user.tenant.slug;
  redirect(`/t/${slug}/login?email=${encodeURIComponent(user.email)}`);
}
