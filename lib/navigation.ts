export const sections = {
  dashboard: { label: "Dashboard", icon: "⌂", href: "/" },
  empresas: { label: "Empresas", icon: "▦", href: "/empresas" },
  usuarios: { label: "Usuarios", icon: "♙", href: "/usuarios" },
  crm: { label: "CRM", icon: "◎", href: "/crm" },
  "call-center": { label: "Call Center", icon: "◉", href: "/call-center" },
  "sms-center": { label: "SMS Center", icon: "✉", href: "/sms-center" },
  whatsapp: { label: "WhatsApp", icon: "◌", href: "/whatsapp" },
  guardian: { label: "Guardian", icon: "◇", href: "/guardian" },
  reportes: { label: "Reportes", icon: "▥", href: "/reportes" },
  configuracion: { label: "Configuración", icon: "⚙", href: "/configuracion" },
} as const;

export type SectionKey = keyof typeof sections;
