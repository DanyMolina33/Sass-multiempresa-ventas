export const tenantInclude = {
  plan: { include: { limits: { include: { definition: true } } } },
  modules: { include: { module: true }, orderBy: { module: { name: "asc" as const } } },
  limitOverrides: { include: { definition: true } },
  branding: true,
} as const;

export function serializeTenant<T>(tenant: T): T {
  return JSON.parse(JSON.stringify(tenant, (_, value) => typeof value === "bigint" ? Number(value) : value));
}

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
