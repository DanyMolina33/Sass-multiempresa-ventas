import { requirePageSession, safeSession } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";
export default async function ChangePasswordPage() {
  const session = await requirePageSession();
  const safe = safeSession(session);
  return <ChangePasswordForm forced={safe.user.mustChangePassword} role={safe.user.role} />;
}
