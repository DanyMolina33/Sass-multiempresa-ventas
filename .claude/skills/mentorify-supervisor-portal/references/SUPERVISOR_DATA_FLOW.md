# Flujo de datos — Portal Supervisor

## Venta propia del Supervisor

```
Mario (SUPERVISOR) → POST /api/crm/sales (sin agentId, o agentId = su propio id)
  → agentId = Mario, supervisorId = null (Mario no reporta a otro supervisor)
  → storeId derivado de su propio Employee (igual que un AGENT — nunca seleccionable a mano)
  → Sale real
GET /crm/sales?scope=self       → Mis ventas (solo Mario)
GET /crm/sales?scope=team       → Ventas del equipo (solo subordinados, nunca incluye a Mario)
GET /api/crm/executive-dashboard → Dashboard Gerente (ya consulta Sale directamente, sin cambios)
```

Probado en vivo (2026-08-17): venta de prueba creada con `agentId=Mario`, confirmado `scope=self`→1,
`scope=team`→0; limpiada al final de la sesión.

## Venta de un Promotor de su equipo

Sin cambios respecto al Portal Promotor: `Dani → POST /api/crm/sales → agentId=Dani, supervisorId=Mario
(derivado automáticamente por jerarquía)`.

## Meta asignada por el Supervisor

```
Mario → POST /api/crm/supervisor-space/goals {promoterId: Dani, ...}
  → valida Dani.supervisorId === Mario.id (nunca de otro Supervisor)
  → CommercialGoal real (scopeType=EMPLOYEE, metric=ACTIVATED_SALES, createdByUserId=Mario)
GET /api/crm/promoter-space (Dani)  → goal ya visible de inmediato, sin copia
GET /api/crm/supervisor-space/goals (Mario) → progreso recalculado vía getSalesMetrics, misma fuente que todo el resto
```

Probado en vivo: meta creada para Dani, visible en su "Mi día" en el mismo request siguiente. Limpiada al cierre.

## Mensaje del Supervisor

```
Mario → POST /api/crm/supervisor-space/messages {audienceType: TEAM, ...}
  → InternalMessage + InternalMessageRecipient (uno por cada subordinado real)
GET /api/crm/promoter-space (Dani) → featuredMessage = el más reciente no vencido dirigido a Dani
  → se marca leído (readAt) en ese mismo GET — no hay un botón "marcar leído" separado
GET /api/crm/supervisor-space/messages (Mario) → recipientCount/readCount ("1 de 1 leyeron")
```

Probado en vivo: mensaje enviado a "Todo mi equipo" (1 destinatario real), aparece en Mi día de Dani, se marca
leído automáticamente, Mario ve "1 de 1 leyeron". Limpiado al cierre.

## Plan de acción

```
Mario → POST /api/crm/supervisor-space/action-plans {assignedUserId: Dani, ...}
  → ActionPlan real (tabla preexistente, 0 filas antes de este bloque)
Dani → GET /api/crm/promoter-space/action-plans → ve el plan
Dani → PATCH /api/crm/action-plans/[id] {status} → solo puede avanzar el estado, nunca editar problema/acciones
Mario → PATCH /api/crm/action-plans/[id] → puede editar todo (es el creador)
```

## Módulos (entitlement)

```
SUPER_ADMIN → TenantModule.enabled (Panel Maestro, sin cambios)
COMPANY_ADMIN → PATCH /api/users/[userId]/modules {moduleId, enabled}
  → valida tenantModule.enabled=true antes de permitir enabled=true (nunca más de lo contratado)
requireCrmContext() → hasModuleAccess(tenant, user, role, "crm") antes de cualquier operación CRM
```

Probado en vivo: revocar el grant de "crm" a Mario bloquea `/api/crm/supervisor-space` con 403 en el mismo
segundo; restaurarlo lo reactiva. Intentar habilitar "Guardian" (no contratado por el tenant) para Mario fue
rechazado con 400.
