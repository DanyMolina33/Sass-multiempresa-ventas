import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { roleLandingPath } from "@/lib/role-routes";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(roleLandingPath(session.user.role.code));
  return <LoginForm />;
}
