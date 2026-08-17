// Pure helper — no server-only imports — so it can be shared by both server pages (redirects) and the client
// login form (window.location.href) without pulling next/headers into the client bundle.
export function roleLandingPath(role: string) {
  if (role === "SUPER_ADMIN") return "/";
  if (role === "AGENT") return "/crm/promoter-space";
  return "/empresa";
}
