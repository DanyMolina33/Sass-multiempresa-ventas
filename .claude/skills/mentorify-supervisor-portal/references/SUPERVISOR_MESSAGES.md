# MentoriFY Internal Messaging

Un solo modelo cubre mensajes individuales/de equipo y campañas (`kind: MESSAGE|CAMPAIGN`) — nunca dos motores
paralelos. No depende de WhatsApp ni SMS.

```prisma
model InternalMessage {
  kind      MESSAGE | CAMPAIGN
  type      MOTIVATIONAL | INFORMATIVE | RECOGNITION | URGENT
  cta       NONE | GOAL | RANKING | SALE
  status    DRAFT | SCHEDULED | ACTIVE | FINISHED | CANCELLED
  startAt, endAt
}
model InternalMessageRecipient { messageId, userId, readAt }
```

## Flujo

- Supervisor compone en `/crm/supervisor-messages`: destinatarios (Todo mi equipo / Un promotor / Varios),
  tipo, título, mensaje.
- El servidor materializa un `InternalMessageRecipient` por cada destinatario **real** (siempre subordinado del
  emisor — nunca confía en la lista del cliente, ver `SUPERVISOR_SECURITY.md`).
- El Promotor ve el mensaje más reciente no vencido dirigido a él como "MENSAJE DE TU SUPERVISOR" al cargar
  Mi día (`/api/crm/promoter-space` → `featuredMessage`) — ese mismo GET lo marca leído.
- El Supervisor ve historial con conteo de lectura ("6 de 8 leyeron") en `/crm/supervisor-messages`.

## Campañas (kind=CAMPAIGN)

Reutilizan el mismo modelo con `startAt`/`endAt` y `cta`. **No implementado en la UI de composición de este
bloque** (el formulario actual siempre crea `kind=MESSAGE`) — el modelo ya soporta campañas si un bloque futuro
necesita exponer el flujo de creación con fechas y CTA. Documentado como pendiente real, no fabricado.

## Límite de mensaje destacado

Solo se muestra 1 mensaje destacado por Promotor (el más reciente no vencido) — nunca una lista larga en Mi día,
para evitar saturación (sección 40). El historial completo queda disponible del lado del Supervisor.
