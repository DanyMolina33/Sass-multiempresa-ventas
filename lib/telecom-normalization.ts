export const YC_PRODUCT_CATALOG = [
  { code: "POSTPAGO", name: "Postpago", category: "POSTPAGO" },
  { code: "PREPAGO", name: "Prepago", category: "PREPAGO" },
  { code: "RENOVACION", name: "Renovación", category: "RENOVACION" },
  { code: "INTERNET_FIJO", name: "Internet fijo", category: "INTERNET_FIJO" },
  { code: "TELEFONIA_FIJA", name: "Telefonía fija", category: "TELEFONIA_FIJA" },
  { code: "TV", name: "TV", category: "TV" },
  { code: "INTERNET_INALAMBRICO", name: "Internet inalámbrico", category: "INTERNET_INALAMBRICO" },
  { code: "OTRO", name: "Otro", category: "OTRO" },
] as const;

export const SALE_TRANSACTION_TYPES = ["PORTABILIDAD_POSTPAGO", "ALTA_NUEVA_POSTPAGO", "MIGRACION", "RENOVACION", "PREPAGO", "LINEA_FIJA", "INTERNET_FIJO", "OTRO"] as const;
export type NormalizedProductCode = typeof YC_PRODUCT_CATALOG[number]["code"];
export type NormalizedTransactionType = typeof SALE_TRANSACTION_TYPES[number];
export type MappingResult<T> = { status: "MAPPED"; value: T } | { status: "PENDIENTE_DE_MAPEO"; source: string };

export function normalizeText(value: unknown) {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

const productAliases: Record<string, NormalizedProductCode> = {
  POSTPAGO: "POSTPAGO", "POST PAGO": "POSTPAGO", PREPAGO: "PREPAGO", RENOVACION: "RENOVACION",
  "INTERNET FIJO": "INTERNET_FIJO", "TELEFONIA FIJA": "TELEFONIA_FIJA", "LINEA FIJA": "TELEFONIA_FIJA",
  TV: "TV", TELEVISION: "TV", "INTERNET INALAMBRICO": "INTERNET_INALAMBRICO", OTRO: "OTRO",
};

const transactionAliases: Record<string, NormalizedTransactionType> = {
  PORTABILIDAD: "PORTABILIDAD_POSTPAGO", "PORTABILIDAD POSTPAGO": "PORTABILIDAD_POSTPAGO",
  "ALTA NUEVA": "ALTA_NUEVA_POSTPAGO", "ALTA NUEVA POSTPAGO": "ALTA_NUEVA_POSTPAGO", MIGRACION: "MIGRACION",
  RENOVACION: "RENOVACION", PREPAGO: "PREPAGO", "LINEA FIJA": "LINEA_FIJA", "INTERNET FIJO": "INTERNET_FIJO", OTRO: "OTRO",
};

export function normalizeProduct(value: unknown): MappingResult<NormalizedProductCode> {
  const source = String(value ?? "").trim(), normalized = normalizeText(source), product = productAliases[normalized];
  return product ? { status: "MAPPED", value: product } : { status: "PENDIENTE_DE_MAPEO", source };
}

export function normalizeTransactionType(value: unknown): MappingResult<NormalizedTransactionType> {
  const source = String(value ?? "").trim(), normalized = normalizeText(source), type = transactionAliases[normalized];
  return type ? { status: "MAPPED", value: type } : { status: "PENDIENTE_DE_MAPEO", source };
}

export function normalizeHistoricalProduct(transaction: unknown, detail: unknown): MappingResult<NormalizedProductCode> {
  const direct = normalizeProduct(detail);
  if (direct.status === "MAPPED") return direct;

  const category = normalizeText(transaction);
  const operation = normalizeText(detail);
  if (category === "PRE PAGO") return { status: "MAPPED", value: "PREPAGO" };
  if (category === "POST PAGO") {
    return { status: "MAPPED", value: operation.includes("RENOVACION") ? "RENOVACION" : "POSTPAGO" };
  }
  if (category === "FIJA") {
    if (operation.includes("TELEFONO") || operation === "FIJO" || operation === "FIJA") {
      return { status: "MAPPED", value: "TELEFONIA_FIJA" };
    }
    if (operation.includes("PLAY") || operation.includes("INTERNET")) {
      return { status: "MAPPED", value: "INTERNET_FIJO" };
    }
  }

  return { status: "PENDIENTE_DE_MAPEO", source: String(detail ?? transaction ?? "").trim() };
}

export function normalizeHistoricalTransactionType(transaction: unknown, detail: unknown): MappingResult<NormalizedTransactionType> {
  const direct = normalizeTransactionType(detail);
  if (direct.status === "MAPPED") return direct;

  const category = normalizeText(transaction);
  const operation = normalizeText(detail);
  if (operation.includes("PORTABILIDAD POST")) return { status: "MAPPED", value: "PORTABILIDAD_POSTPAGO" };
  if (operation.includes("ALTA") && operation.includes("POST")) return { status: "MAPPED", value: "ALTA_NUEVA_POSTPAGO" };
  if (operation === "ALTA NUEVA") return { status: "MAPPED", value: "ALTA_NUEVA_POSTPAGO" };
  if (operation.includes("MIGRACION")) return { status: "MAPPED", value: "MIGRACION" };
  if (operation.includes("RENOVACION POST")) return { status: "MAPPED", value: "RENOVACION" };
  if (category === "PRE PAGO" || operation.includes(" PRE") || operation.startsWith("PRE ")) return { status: "MAPPED", value: "PREPAGO" };
  if (category === "FIJA") {
    return { status: "MAPPED", value: operation.includes("INTERNET") || operation.includes("PLAY") ? "INTERNET_FIJO" : "LINEA_FIJA" };
  }

  return { status: "PENDIENTE_DE_MAPEO", source: String(detail ?? transaction ?? "").trim() };
}

export function normalizeDocument(value: unknown) { return String(value ?? "").replace(/\D/g, "").slice(0, 20) || null; }
export function normalizePhone(value: unknown) { const digits = String(value ?? "").replace(/\D/g, ""); return digits ? (digits.startsWith("51") ? digits : `51${digits}`) : null; }
export function normalizeIdentifier(value: unknown) { return normalizeText(value).replace(/\s+/g, "") || null; }
export function normalizeAdvisorName(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es-PE") || null; }
export function normalizePlan(value: unknown) { return normalizeText(value).replace(/\s+/g, "_") || null; }
export function normalizeSaleStatus(value: unknown) {
  const aliases: Record<string, string> = {
    REGISTRADA: "REGISTRADA", "EN VALIDACION": "EN_VALIDACION", "EN EJECUCION": "EN_VALIDACION",
    APROBADA: "APROBADA", PAGADO: "APROBADA", ACTIVADA: "ACTIVADA", INSTALADO: "ACTIVADA",
    RECHAZADA: "RECHAZADA", RECHAZADO: "RECHAZADA", CANCELADA: "CANCELADA",
  };
  const source = String(value ?? "").trim(), status = aliases[normalizeText(source)];
  return status ? { status: "MAPPED" as const, value: status } : { status: "PENDIENTE_DE_MAPEO" as const, source };
}
export function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const source = String(value ?? "").trim(); if (!source) return null;
  const match = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const date = match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function prepareHistoricalRow(row: Record<string, unknown>) {
  return {
    customer: { document: normalizeDocument(row.documento ?? row.dni), phone: normalizePhone(row.telefono ?? row.msisdn), name: String(row.cliente ?? "").trim() },
    sale: { date: normalizeDate(row.fecha), sec: normalizeIdentifier(row.sec), sot: normalizeIdentifier(row.sot), status: normalizeSaleStatus(row.estado), transactionType: normalizeTransactionType(row.tipoOperacion) },
    product: normalizeProduct(row.producto), commercialPlanKey: normalizePlan(row.plan), agentName: normalizeAdvisorName(row.asesor), supervisorName: normalizeAdvisorName(row.supervisor),
  };
}
