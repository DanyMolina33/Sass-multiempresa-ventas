export const COMMISSION_TYPES = ["FIXED_PER_SALE", "PERCENTAGE", "TIERED_BY_SALE_COUNT"] as const;
export const TIER_TYPES = ["FIXED_PER_SALE", "PERCENTAGE"] as const;
export const ELIGIBILITY = ["SALE_APPROVED", "SALE_RECOGNIZED"] as const;
export const COMPONENT_ROLES = ["INCOME", "DEDUCTION", "EMPLOYER_CONTRIBUTION"] as const;
export const CALC_TYPES = ["FIXED", "PERCENTAGE"] as const;
// GROSS_AMOUNT is deliberately excluded here: commission and INCOME-role components are exactly what compose
// gross, so allowing them to reference gross as their own base would be circular. DEDUCTION and
// EMPLOYER_CONTRIBUTION components run after gross is final and may use the wider BASES_ALL set instead.
export const BASES_BEFORE_GROSS = ["SALE_AMOUNT", "RECOGNIZED_AMOUNT", "EXPECTED_COMPANY_INCOME", "BASE_SALARY"] as const;
export const BASES_ALL = [...BASES_BEFORE_GROSS, "GROSS_AMOUNT"] as const;

function numberOrNull(value: unknown, label: string, allowNegative = false) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || (!allowNegative && n < 0)) throw new Response(`${label} debe ser un número válido${allowNegative ? "" : " no negativo"}`, { status: 400 });
  return n;
}

function dateValue(value: unknown, required: boolean, endOfDay = false) {
  if (!value) { if (required) throw new Response("La fecha de vigencia es obligatoria", { status: 400 }); return null; }
  const date = new Date(`${String(value).slice(0, 10)}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) throw new Response("Fecha inválida", { status: 400 });
  return date;
}

type CommissionInput = {
  calculationType: typeof COMMISSION_TYPES[number];
  eligibility: typeof ELIGIBILITY[number];
  fixedAmountPerSale: number | null;
  percentageValue: number | null;
  percentageBase: string | null;
  active: boolean;
  tiers: Array<{ minSales: number; maxSales: number | null; tierCalculationType: typeof TIER_TYPES[number]; fixedAmountPerSale: number | null; percentageValue: number | null; percentageBase: string | null }>;
};

export function commissionRuleData(body: unknown): CommissionInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const calculationType = String(raw.calculationType ?? "");
  if (!COMMISSION_TYPES.includes(calculationType as never)) throw new Response("Tipo de cálculo de comisión inválido", { status: 400 });
  const eligibility = String(raw.eligibility ?? "");
  if (!ELIGIBILITY.includes(eligibility as never)) throw new Response("Selecciona cuándo una venta genera comisión", { status: 400 });

  if (calculationType === "FIXED_PER_SALE") {
    const fixedAmountPerSale = numberOrNull(raw.fixedAmountPerSale, "El monto fijo por venta");
    if (fixedAmountPerSale === null) throw new Response("Ingresa el monto fijo por venta", { status: 400 });
    return { calculationType, eligibility, fixedAmountPerSale, percentageValue: null, percentageBase: null, active: raw.active !== false, tiers: [] } as CommissionInput;
  }
  if (calculationType === "PERCENTAGE") {
    const percentageValue = numberOrNull(raw.percentageValue, "El porcentaje");
    const percentageBase = raw.percentageBase ? String(raw.percentageBase) : null;
    if (percentageValue === null || !percentageBase) throw new Response("El porcentaje requiere un valor y una base económica real", { status: 400 });
    if (!BASES_BEFORE_GROSS.includes(percentageBase as never)) throw new Response("Base económica inválida para comisión", { status: 400 });
    return { calculationType, eligibility, fixedAmountPerSale: null, percentageValue, percentageBase, active: raw.active !== false, tiers: [] } as CommissionInput;
  }
  // TIERED_BY_SALE_COUNT
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  if (!rawTiers.length) throw new Response("Agrega al menos un tramo para la comisión escalonada", { status: 400 });
  const tiers = rawTiers.map((rawTier) => {
    const tier = rawTier as Record<string, unknown>;
    const minSales = Number(tier.minSales); const maxSales = tier.maxSales === "" || tier.maxSales === null || tier.maxSales === undefined ? null : Number(tier.maxSales);
    if (!Number.isInteger(minSales) || minSales < 0) throw new Response("El mínimo de ventas de cada tramo debe ser un entero válido", { status: 400 });
    if (maxSales !== null && (!Number.isInteger(maxSales) || maxSales < minSales)) throw new Response("El máximo de ventas de un tramo no puede ser menor que su mínimo", { status: 400 });
    const tierCalculationType = String(tier.tierCalculationType ?? "");
    if (!TIER_TYPES.includes(tierCalculationType as never)) throw new Response("Tipo de tramo inválido", { status: 400 });
    if (tierCalculationType === "FIXED_PER_SALE") {
      const fixedAmountPerSale = numberOrNull(tier.fixedAmountPerSale, "El monto fijo del tramo");
      if (fixedAmountPerSale === null) throw new Response("Ingresa el monto fijo del tramo", { status: 400 });
      return { minSales, maxSales, tierCalculationType, fixedAmountPerSale, percentageValue: null, percentageBase: null };
    }
    const percentageValue = numberOrNull(tier.percentageValue, "El porcentaje del tramo");
    const percentageBase = tier.percentageBase ? String(tier.percentageBase) : null;
    if (percentageValue === null || !percentageBase) throw new Response("El tramo porcentual requiere valor y base económica real", { status: 400 });
    if (!BASES_BEFORE_GROSS.includes(percentageBase as never)) throw new Response("Base económica inválida para el tramo", { status: 400 });
    return { minSales, maxSales, tierCalculationType, fixedAmountPerSale: null, percentageValue, percentageBase };
  }).sort((a, b) => a.minSales - b.minSales);
  for (let i = 1; i < tiers.length; i += 1) {
    const previous = tiers[i - 1], current = tiers[i];
    if (previous.maxSales === null || current.minSales <= previous.maxSales) throw new Response(`Los tramos se superponen entre ${previous.minSales}-${previous.maxSales ?? "∞"} y ${current.minSales}-${current.maxSales ?? "∞"}`, { status: 400 });
  }
  return { calculationType, eligibility, fixedAmountPerSale: null, percentageValue: null, percentageBase: null, active: raw.active !== false, tiers } as CommissionInput;
}

export function componentsData(body: unknown) {
  if (!Array.isArray(body)) return [];
  return body.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const role = String(item.role ?? "");
    if (!COMPONENT_ROLES.includes(role as never)) throw new Response("Tipo de componente inválido", { status: 400 });
    const category = String(item.category ?? "").trim() || "OTRO";
    const name = String(item.name ?? "").trim();
    if (!name) throw new Response("Cada componente necesita un nombre", { status: 400 });
    const calculationType = String(item.calculationType ?? "");
    if (!CALC_TYPES.includes(calculationType as never)) throw new Response(`Selecciona el tipo de cálculo para ${name}`, { status: 400 });
    const allowedBases = role === "INCOME" ? BASES_BEFORE_GROSS : BASES_ALL;
    if (calculationType === "FIXED") {
      const amount = numberOrNull(item.amount, `El monto de ${name}`);
      if (amount === null) throw new Response(`Ingresa el monto de ${name}`, { status: 400 });
      return { role, category, name, calculationType, amount, percentageValue: null, percentageBase: null, active: item.active !== false };
    }
    const percentageValue = numberOrNull(item.percentageValue, `El porcentaje de ${name}`);
    const percentageBase = item.percentageBase ? String(item.percentageBase) : null;
    if (percentageValue === null || !percentageBase) throw new Response(`${name} requiere porcentaje y una base económica real`, { status: 400 });
    if (!allowedBases.includes(percentageBase as never)) throw new Response(`Base económica no permitida para ${name}`, { status: 400 });
    return { role, category, name, calculationType, amount: null, percentageValue, percentageBase, active: item.active !== false };
  });
}

export function compensationPlanData(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim(), code = String(body.code ?? "").trim().toUpperCase();
  if (!name || !code) throw new Response("Nombre y código del plan son obligatorios", { status: 400 });
  const mode = String(body.mode ?? "");
  if (!["FIJO", "COMISIONISTA", "MIXTO"].includes(mode)) throw new Response("Selecciona la modalidad del plan", { status: 400 });
  const baseSalary = numberOrNull(body.baseSalary, "El sueldo base");
  const effectiveFrom = dateValue(body.effectiveFrom, true)!;
  const effectiveTo = dateValue(body.effectiveTo, false, true);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Response("La vigencia hasta no puede ser anterior a la vigencia desde", { status: 400 });
  return {
    plan: { name, code, mode: mode as never, baseSalary, effectiveFrom, effectiveTo, active: body.active === undefined ? true : Boolean(body.active) },
    commissionRule: commissionRuleData(body.commissionRule),
    components: componentsData(body.components),
  };
}
