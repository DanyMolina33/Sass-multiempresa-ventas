# Meta Deployment — URLs y checklist de producción

No se inventó ningún dominio real — `<DOMINIO>` es un placeholder literal hasta que exista un despliegue real
(Coolify u otro) con un dominio confirmado.

## URLs a registrar en el panel de Meta for Developers

```
Valid OAuth Redirect URI:
https://<DOMINIO>/api/integrations/meta/whatsapp/callback

Webhook callback URL:
https://<DOMINIO>/api/integrations/meta/whatsapp/webhook

Data deletion callback URL:
https://<DOMINIO>/api/integrations/meta/data-deletion

JavaScript SDK Domain (App Domains):
<DOMINIO>
```

## Checklist antes de una prueba Embedded Signup real

1. Desplegar con dominio HTTPS real (Coolify o equivalente) — hoy corre en `localhost`, Meta exige HTTPS público
   para el webhook y para App Domains.
2. Crear la App en Meta for Developers, agregar el producto "WhatsApp", configurar Embedded Signup con un
   `config_id` real.
3. Configurar las 4 URLs de arriba con el dominio real.
4. Definir `META_WEBHOOK_VERIFY_TOKEN` (cualquier cadena propia, coincide con lo que se registra en Meta).
5. Generar `INTEGRATION_ENCRYPTION_KEY` real (aleatoria, solo en el entorno de producción, nunca en el repo).
6. Completar `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_APP_SECRET` en el
   entorno de despliegue (no en `.env` del repo).
7. Suscribir el webhook a los campos `messages` del WABA de prueba.
8. Ejecutar Embedded Signup real con una cuenta de WhatsApp Business de prueba.

Hasta que 1-6 existan, el código queda en `META_CODE_READY = PASS` / `META_LIVE_E2E = WAITING_EXTERNAL_CONFIG`
— eso no es una falla (sección 30 del bloque).
