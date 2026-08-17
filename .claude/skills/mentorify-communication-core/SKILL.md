---
name: mentorify-communication-core
description: Núcleo de comunicación multi-canal de MentoriFY (base Meta WhatsApp, portable a futuros verticales como Restaurant SaaS). Consultar antes de tocar lib/communication-core/**, lib/integrations/whatsapp/**, /whatsapp, o cualquier ruta bajo /api/integrations/meta/**.
---

# Communication Core — Meta WhatsApp (bloque 32)

Fuente de verdad de la integración Meta WhatsApp Embedded Signup y su núcleo portable. Léelo completo, junto con
`mentorify-supervisor-portal` (de ahí viene `UserModuleGrant`/`hasModuleAccess`, reutilizado tal cual aquí).

## Qué es esto

Base real y reusable de WhatsApp Business (Meta), NO automatización, NO IA, NO Call Center. El objetivo es dejar
la integración lista para App Review y utilizable end-to-end una vez existan credenciales reales de Meta.

## Arquitectura portable

```
lib/communication-core/          <- NUNCA importa Customer/Sale/CRM. Portable a otro vertical sin cambios.
  contracts/adapter.ts             CommunicationAdapter (base) + RestaurantCommunicationAdapter (contrato futuro)
  contracts/provider.ts            CommunicationProvider (sendMessage/listTemplates, agnóstico de Meta)
  providers/meta-whatsapp/         Cliente Graph API, verificación de webhook, signed_request
  security/encryption.ts           AES-256-GCM para tokens (INTEGRATION_ENCRYPTION_KEY)
  events/types.ts                  message.received/sent, conversation.created/assigned — solo tipos, nadie escucha aún
  tenant/resolve.ts                phoneNumberId -> tenantId (NUNCA confía en tenantId del cliente)
  whatsapp-service.ts               Servicio del Core: connect/disconnect/send/ingest — usa Prisma solo para sus propios modelos WhatsApp*/Tenant

lib/integrations/whatsapp/
  contact-center-adapter.ts        ÚNICO archivo que puede importar Customer — implementa CommunicationAdapter
  access.ts                         requireWhatsAppContext()/requireCompanyAdminForWhatsApp() — gating específico de WhatsApp
```

**Regla de oro**: si un archivo bajo `lib/communication-core/` necesita saber qué es un "cliente", una "venta" o
un "producto", está mal ubicado — pertenece a `lib/integrations/whatsapp/contact-center-adapter.ts`.

## Regla de habilitación (sección 2)

```
efectivo = TenantModule.whatsapp.enabled AND UserModuleGrant.whatsapp.enabled AND rol
```

Implementado en `lib/module-entitlement.ts#hasModuleAccess` (ya existía, reutilizado sin cambios) +
`lib/integrations/whatsapp/access.ts#requireWhatsAppContext()` para las rutas API, y en `app/[section]/page.tsx`
para la página `/whatsapp` (ahí SÍ se agregó el chequeo de `UserModuleGrant` que faltaba — antes solo se
verificaba `TenantModule`, un hueco real encontrado en la auditoría de este bloque).

Desactivar WhatsApp desde Panel Maestro (`TenantModule`) solo bloquea `/whatsapp` y las rutas
`/api/integrations/meta/whatsapp/*` — nunca borra `WhatsAppConnection` ni el historial de mensajes.

## Credenciales: plataforma vs tenant

- **Plataforma** (`.env`, nunca en DB): `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`,
  `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `INTEGRATION_ENCRYPTION_KEY`.
- **Por tenant** (`WhatsAppConnection`/`WhatsAppPhoneNumber`, cifradas): WABA ID, Business ID, Phone Number ID,
  access token. Nunca un token global para todos los clientes.

Ver `META_WHATSAPP.md` para el flujo completo y `META_DEPLOYMENT.md` para las URLs exactas a registrar en Meta.

## Antes de tocar código

Lee `CURRENT_STATE.md` — documenta qué está `CODE_READY` vs `WAITING_EXTERNAL_CONFIG` (sin credenciales reales
de Meta, la prueba end-to-end real no puede ejecutarse — eso no es una falla del código).
