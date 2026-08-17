# Estado actual — Communication Core (bloque 32, 2026-08-17)

## META_CODE_READY = PASS / META_LIVE_E2E = WAITING_EXTERNAL_CONFIG

Todo el código está escrito, tipado, probado y funcionando correctamente contra la base de datos real y el
servidor real de esta sesión. Lo único que falta es 100% externo: credenciales reales de Meta (App ID real,
Config ID real de Embedded Signup, App Secret real) y un dominio HTTPS de producción. Sin eso, una prueba
Embedded Signup real no puede ejecutarse — eso no es una falla del código (sección 30 del bloque).

## Hallazgo real corregido en este bloque

`app/[section]/page.tsx` (ruta genérica `/[section]`, usada por `/whatsapp` entre otras) solo verificaba
`TenantModule` antes de este bloque — nunca `UserModuleGrant`. Para WhatsApp específicamente esto violaba la
regla maestra ("TenantModule AND UserModuleGrant AND RBAC"). Corregido agregando el chequeo específico para
`section==="whatsapp"`, sin tocar el comportamiento de las demás secciones genéricas (Guardian, Reportes, etc.
— fuera del alcance de este bloque).

## Reutilizado sin cambios

- `lib/module-entitlement.ts#hasModuleAccess` (bloque Supervisor Portal) — fórmula de habilitación completa.
- `lib/auth.ts` (`requireSession`, `isSuperAdmin`, `getSelectedTenant`) — mismo patrón que el resto del CRM.
- `PATCH /api/core/tenants/[tenantId]/modules` (switch de Panel Maestro) — ya soportaba cualquier módulo,
  incluido "whatsapp"; no se tocó.
- `ModuleGrantsEditor` en `components/dashboard-shell.tsx` (bloque Supervisor Portal) — ya itera todos los
  módulos del catálogo; el Gerente ya puede habilitar/deshabilitar WhatsApp por usuario sin ningún cambio
  adicional.

## Nuevo en este bloque

Ver `ARCHITECTURE.md` para el detalle completo del modelo de datos y flujo. Resumen de archivos:

- `prisma/schema.prisma` — 7 modelos nuevos (`WhatsAppConnection`, `WhatsAppPhoneNumber`,
  `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppTemplate`, `MetaDataDeletionRequest`), aditivo, migración
  `20260817030000_whatsapp_communication_core` aplicada.
- `lib/communication-core/**` — núcleo portable (contratos, proveedor Meta, cifrado, resolución de tenant,
  eventos, servicio).
- `lib/integrations/whatsapp/contact-center-adapter.ts` + `access.ts`.
- 9 rutas API bajo `/api/integrations/meta/**`.
- `components/whatsapp-workspace.tsx` — UI del Gerente (conectar/estado/plantillas/mensaje de prueba).
- `scripts/verify-whatsapp-communication-core.ts` — 21 verificaciones automatizadas (cifrado, firma de webhook,
  signed_request, idempotencia real contra DB, resolución de tenant).

## Pendiente real (no bloqueante para este bloque)

- No existe Inbox operativa para Supervisor/Promotor todavía (sección 25 explícitamente lo excluye de este
  bloque) — un usuario con `UserModuleGrant.whatsapp` puede entrar a `/whatsapp` pero solo ve un mensaje
  informativo, no una bandeja de conversaciones. Documentado como pendiente justificado, no un bug.
- La creación de plantillas es mínima (un solo componente BODY) — sin header/footer/botones/variables.
- El adapter de Restaurant es solo un contrato TypeScript (`RestaurantCommunicationAdapter`), nunca implementado
  ni usado — exactamente como pedía la sección 23.
