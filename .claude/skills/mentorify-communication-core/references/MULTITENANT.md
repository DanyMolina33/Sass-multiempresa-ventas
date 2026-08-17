# Multitenant — WhatsApp

## Aislamiento

- `WhatsAppConnection.tenantId @unique` — una empresa, una conexión.
- Cada tabla hija (`WhatsAppPhoneNumber`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppTemplate`) tiene su
  propio `tenantId`, no solo heredado por relación — toda query real filtra por `tenantId` directo.
- El webhook **nunca** confía en un `tenantId` recibido del payload o del cliente: siempre resuelve
  `phone_number_id → WhatsAppPhoneNumber → tenantId` (`lib/communication-core/tenant/resolve.ts`).
- Las rutas API tenant-scoped (`status`, `templates`, `test-message`, `connect/*`, `disconnect`) derivan
  `tenantId` de la sesión (`requireWhatsAppContext()`), igual que el resto del CRM — nunca de un parámetro.

## Habilitación jerárquica

```
SUPER_ADMIN  → TenantModule.whatsapp (Panel Maestro, ya existía, reutilizado sin cambios)
COMPANY_ADMIN → conecta Meta + UserModuleGrant.whatsapp por usuario (editor ya existía, genérico, cubre WhatsApp sin cambios)
SUPERVISOR/AGENT → solo consumen si tienen grant; nunca ven WABA, tokens, ni pueden conectar/desconectar
```

`requireCompanyAdminForWhatsApp()` bloquea explícitamente a SUPERVISOR/AGENT de las rutas de administración
(conectar, desconectar, ver configuración completa, plantillas, mensaje de prueba) — el rol se verifica por
código, no solo por permiso en base de datos (mismo patrón defensivo de `isCompanyAdmin()` del bloque Supervisor
Portal, que ya demostró que los datos de permisos pueden driftar).

## Pruebas ejecutadas

Ver `SUPERVISOR_QA.md`-equivalente para este bloque en el informe final entregado — Tenant A no puede leer
`WhatsAppConnection`/`WhatsAppPhoneNumber`/mensajes de Tenant B por ningún ID manipulado (siempre 403/404).
