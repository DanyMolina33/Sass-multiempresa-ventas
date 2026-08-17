# Arquitectura — Communication Core

## Modelo de datos (aditivo, migración `20260817030000_whatsapp_communication_core`)

```
Tenant 1───1 WhatsAppConnection 1───N WhatsAppPhoneNumber 1───N WhatsAppConversation 1───N WhatsAppMessage
                    │                                                    │
                    └── WhatsAppTemplate[]                               └── Customer? (opcional, vía adapter)
```

- `WhatsAppConnection`: una por tenant (`tenantId @unique`). Guarda `wabaId`, `businessId`, `displayName`,
  `encryptedAccessToken` (cifrado, nunca texto plano), `status` (DISCONNECTED/CONNECTING/CONNECTED/ERROR).
- `WhatsAppPhoneNumber`: 1 tenant → N números (modelado así aunque V1 use uno solo — nunca hardcodeado a 1).
- `WhatsAppConversation`/`WhatsAppMessage`: base mínima de mensajería, aislados por `tenantId` en cada tabla
  (no solo heredado por relación) para que cualquier query pueda filtrar directo sin joins.
- `WhatsAppTemplate`: caché local de plantillas de Meta + capacidad de creación mínima.
- `MetaDataDeletionRequest`: registro de solicitudes de borrado de Meta — nunca dispara un borrado automático.

## Flujo de datos

```
Gerente click "Conectar con Meta"
  → POST /api/integrations/meta/whatsapp/connect/start   (nonce + cookie httpOnly)
  → FB SDK carga, FB.login({config_id, response_type:"code"})
  → Meta popup: Embedded Signup real
  → postMessage WA_EMBEDDED_SIGNUP {waba_id, phone_number_id}  +  FB.login callback {code}
  → POST /api/integrations/meta/whatsapp/callback {code, wabaId, phoneNumberId, state}
      tenantId/userId SIEMPRE de la sesión, nunca del body
      state debe coincidir con la cookie (mezcla de sesiones)
  → intercambio code→access_token (server-side, App Secret nunca sale del servidor)
  → WhatsAppConnection/WhatsAppPhoneNumber persistidos (token cifrado)

Meta → POST /api/integrations/meta/whatsapp/webhook (mensaje entrante)
  → verificación de firma X-Hub-Signature-256
  → resolveTenantFromPhoneNumberId(phone_number_id)  -- nunca confía en tenantId del payload
  → idempotente por externalMessageId (wamid)
  → ContactCenterAdapter.resolveCustomer() -- vincula Customer solo si el match es inequívoco
  → WhatsAppConversation + WhatsAppMessage persistidos
```

## Por qué el Core nunca importa CRM

`lib/communication-core/**` no sabe qué es un `Customer`. Esto es lo que hace posible reutilizar el mismo
paquete para un vertical futuro (Restaurant SaaS) sin tocar una sola línea del Core — solo se escribe un nuevo
adapter (`lib/integrations/<vertical>/*-adapter.ts`) que implemente `CommunicationAdapter`.
