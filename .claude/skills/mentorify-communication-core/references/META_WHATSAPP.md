# Meta WhatsApp — detalle de integración

## Embedded Signup (frontend)

`components/whatsapp-workspace.tsx` carga el SDK oficial (`connect.facebook.net/es_LA/sdk.js`), inicializa con
`NEXT_PUBLIC_META_APP_ID`, y llama `FB.login(callback, {config_id: NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID,
response_type:"code", override_default_response_type:true})`. Además escucha el evento `message` del popup
(`WA_EMBEDDED_SIGNUP`/`FINISH`) para capturar `waba_id`/`phone_number_id` — Meta los entrega por ese canal, no
por el `code` de OAuth. Ambos (código + IDs) se envían juntos al backend.

## Intercambio de token (backend)

`lib/communication-core/providers/meta-whatsapp/client.ts#exchangeCodeForToken` — `GET /oauth/access_token` con
`client_id`(App ID)/`client_secret`(App Secret)/`code`. El App Secret nunca sale de este archivo.

## Envío de mensajes

`lib/communication-core/whatsapp-service.ts#sendTextMessage` — `POST /{phone_number_id}/messages`, tipo `text`.
Usado hoy solo por el mensaje de prueba admin-only (`/api/integrations/meta/whatsapp/test-message`).

## Plantillas

`listTemplatesForTenant`/`createTemplateForTenant` — `GET`/`POST /{waba_id}/message_templates`. La creación es
mínima: un solo componente BODY, sin header/footer/botones/variables — suficiente para demostrar la capacidad
real ante App Review, no un diseñador de plantillas.

## Webhook

`GET /api/integrations/meta/whatsapp/webhook` — handshake `hub.mode`/`hub.verify_token`/`hub.challenge` contra
`META_WEBHOOK_VERIFY_TOKEN`.
`POST` — verifica `X-Hub-Signature-256` (HMAC-SHA256 del body crudo con `META_APP_SECRET`) antes de leer nada.
Idempotente por `externalMessageId` (wamid de Meta) — un mismo evento reenviado nunca crea una segunda fila.

## Data Deletion Callback

`POST /api/integrations/meta/data-deletion` — decodifica `signed_request` (formato clásico de Meta:
`base64url(firma).base64url(payload)`, HMAC-SHA256 con App Secret), registra la solicitud en
`MetaDataDeletionRequest`, responde `{url, confirmation_code}`. `GET /api/integrations/meta/data-deletion/status`
consulta el estado por `confirmation_code`. Nunca borra datos comerciales por sí solo (ver sección 14 del bloque).

## Variables de entorno

Ver `.env.example`. `NEXT_PUBLIC_META_APP_ID`/`NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` son públicas por
diseño (Meta las exige en el navegador). `META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN`/
`INTEGRATION_ENCRYPTION_KEY` son exclusivamente server-side.
