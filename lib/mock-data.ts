export type HealthState = "operational" | "warning" | "critical" | "no-data";

export const company = {
  id: "tenant_clinica_demo",
  name: "Clínica Demo",
  code: "CLI-001",
  status: "Activa",
  plan: "Business",
  users: 18,
  createdAt: "12 ene 2026",
};

export const moduleCatalog = [
  { id: "crm", name: "CRM", description: "Clientes, ventas y seguimientos", active: true },
  { id: "reportes", name: "Reportes", description: "Indicadores y análisis del negocio", active: true },
  { id: "guardian", name: "Guardian", description: "Observación de infraestructura", active: true },
  { id: "call-center", name: "Call Center", description: "Campañas, agentes y telefonía", active: false },
  { id: "sms-center", name: "SMS Center", description: "Campañas y mensajería SMS", active: false },
  { id: "whatsapp", name: "WhatsApp", description: "Mensajería y chatbot", active: false },
];

export const planLimits = [
  { label: "Usuarios", used: 18, limit: 25 },
  { label: "Registros CRM", used: 1284, limit: 5000 },
  { label: "Almacenamiento", used: 4.8, limit: 20, unit: "GB" },
];

export const roles = [
  { name: "Super Administrador", users: 1, scope: "Plataforma" },
  { name: "Administrador de empresa", users: 2, scope: "Clínica Demo" },
  { name: "Agente", users: 15, scope: "Módulos asignados" },
];

export const guardian = {
  name: "ViciBox-LAB",
  ip: "192.168.0.8",
  status: "Online",
  lastUpdate: "Hace 24 segundos",
  metrics: [
    { name: "CPU", value: 38, display: "38%", state: "operational" as HealthState },
    { name: "RAM", value: 67, display: "67%", state: "warning" as HealthState },
    { name: "Swap", value: 12, display: "12%", state: "operational" as HealthState },
    { name: "Disco", value: 54, display: "54%", state: "operational" as HealthState },
  ],
  services: [
    { name: "Asterisk", detail: "Servicio activo", state: "operational" as HealthState },
    { name: "VICIdial", detail: "Servicio disponible", state: "operational" as HealthState },
    { name: "SIP · Zadarma", detail: "Registered", state: "operational" as HealthState },
    { name: "Llamadas activas", detail: "7 en curso", state: "operational" as HealthState },
    { name: "firewalld", detail: "Activo", state: "operational" as HealthState },
    { name: "Grabaciones", detail: "Sin telemetría", state: "no-data" as HealthState },
  ],
};
