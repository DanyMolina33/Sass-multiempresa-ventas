# Arquitectura de módulos — Super Admin → Tenant → Usuario → RBAC

## Modelo

```prisma
model Module           // catálogo global — ya existía, sin cambios
model TenantModule      // Nivel 2: SUPER_ADMIN habilita por tenant — ya existía, sin cambios
model UserModuleGrant   // Nivel 3: COMPANY_ADMIN habilita por usuario — NUEVO este bloque
```

`UserModuleGrant`: `id, tenantId, userId, moduleId, enabled, grantedByUserId, createdAt, updatedAt`,
`@@unique([userId, moduleId])`.

## Fórmula de acceso efectivo (`lib/module-entitlement.ts`)

```
effectiveAccess =
  tenantModule.enabled
  AND (COMPANY_ADMIN/SUPER_ADMIN ? true : userModuleGrant.enabled === true)
  AND rol/permiso (RBAC existente, sin cambios)
```

`getEffectiveModuleCodes(tenantId, userId, roleCode)` y `hasModuleAccess(...)` son las únicas funciones que
deciden esto — usadas en `requireCrmContext()` (bloquea CRM completo) y disponibles para cualquier módulo futuro
que necesite el mismo patrón (Call Center, SMS, WhatsApp — hoy siguen siendo placeholders, sección 93 del bloque
no pedía construir su funcionalidad real, solo dejar el entitlement correctamente cableado).

## Migración de datos (no destructiva)

Al introducir `UserModuleGrant`, se hizo un backfill de una sola vez: todo usuario `SUPERVISOR`/`AGENT` activo
recibió `enabled=true` para cada módulo que su tenant ya tenía habilitado — así el nuevo control no le quita a
nadie un acceso que ya tenía de facto. Ver `CURRENT_STATE.md` para el detalle (incluye un error real cometido y
corregido en la misma sesión: el primer backfill no filtró por tenant y tocó Clínica Demo por error).

## UI del Gerente (`ModuleGrantsEditor` en `components/dashboard-shell.tsx`)

Dentro de "Editar usuario", visible solo cuando el rol es SUPERVISOR o AGENT: checklist con
`Habilitado por tu plan` / `No disponible para tu empresa` (deshabilitado, nunca oculto). Guarda vía
`PATCH /api/users/[userId]/modules`, exclusivo COMPANY_ADMIN.

## Probado en vivo

Ver la tabla en `SUPERVISOR_SECURITY.md` — revocar/restaurar el grant de CRM a un Supervisor cambia su acceso
efectivo de inmediato (403 ↔ 200), y un módulo no contratado por el tenant no puede habilitarse por usuario
aunque el Gerente lo intente.
