---
name: mentorify-supervisor-portal
description: Portal Supervisor de MentoriFY (Inicio, Mi equipo, Metas, Ranking, Rendimiento, Mensajes, Planes de acción, Ventas/Clientes del equipo, Seguimientos, Agenda, Alertas) y el sistema jerárquico de habilitación de módulos (Tenant → Usuario → RBAC). Consultar antes de tocar el rol SUPERVISOR, UserModuleGrant, InternalMessage o ActionPlan.
---

# Portal Supervisor + Module Entitlements — MentoriFY

Fuente de verdad de este bloque. Reusable entre tenants (no específico de YC). Léelo completo, junto con
`mentorify-promoter-portal` (el Supervisor reutiliza su infraestructura de enlace corto, ventas y ranking).

## Qué es esto

El SUPERVISOR tiene doble identidad: administra a sus Promotores (subordinados por `User.supervisorId`) **y**
vende personalmente (`Sale.agentId = supervisor.id`). Su portal vive en `/crm/supervisor-*`, con sidebar propio
(`SUPERVISOR_NAV` en `components/dashboard-shell.tsx`), separado del sidebar administrativo y del de Promotor.

## Jerarquía de módulos (Nivel 1-2-3)

```
Module (catálogo global, ya existía)
  → TenantModule (SUPER_ADMIN habilita por tenant, ya existía)
    → UserModuleGrant (COMPANY_ADMIN habilita por usuario, NUEVO este bloque)
      → effectiveAccess (lib/module-entitlement.ts)
```

`effectiveAccess = tenantModule.enabled AND userModuleGrant.enabled AND rol/permiso`. COMPANY_ADMIN/SUPER_ADMIN
saltan la capa de grant (son los administradores del entitlement, no consumidores). Aplicado server-side en
`requireCrmContext()` (bloquea "crm" completo si no hay grant) — nunca solo en el sidebar.

Ver `references/PROMOTER_MODULE_ACCESS.md` → `SUPERVISOR_MODULE_ACCESS.md` para el detalle probado en vivo.

## Reutilizado (no duplicado)

- `lib/crm-access.ts` (`requireCrmContext`, `teamUserIds`) — sin cambios en su lógica central; solo se le agregó
  la verificación de `UserModuleGrant` vía `hasModuleAccess`.
- `/api/crm/sales`, `/api/crm/customers` — mismos endpoints que Promotor, extendidos con `?scope=self|team` para
  separar "Mis ventas" de "Ventas del equipo" sin crear una tabla ni motor paralelo.
- `NewSaleModal` (de `promoter-space-workspace.tsx`, ahora exportado) — el Supervisor vendedor lo reutiliza tal cual.
- `CommercialGoal` — mismo modelo que ya usaba el Portal Promotor; el Supervisor ahora también **escribe** en él
  (antes solo se leía). Ver el gap real que esto expuso en `CURRENT_STATE.md`.
- `ActionPlan` — tabla real preexistente (0 filas antes de este bloque), modelada aquí por primera vez.
- `/p/[code]` — el enlace corto de acceso ya era genérico por rol; el Supervisor lo usa sin ningún cambio de ruta.

## Nuevo en este bloque

- `UserModuleGrant`, `InternalMessage`/`InternalMessageRecipient` (mensajería interna), `ActionPlan` (modelo Prisma
  nuevo sobre tabla ya existente), `User.mustChangePassword`, `Employee.commercialCode`.
- `lib/module-entitlement.ts`, `lib/supervisor-team.ts`, `lib/supervisor-alerts.ts`, `lib/commercial-code.ts`.
- `/api/crm/supervisor-space*` (agregador Inicio + equipo, metas, ranking, mensajes, planes de acción,
  seguimientos, alertas), `/api/users/[userId]/modules`, `/api/auth/change-password`.
- `/cambiar-password` (cambio de contraseña forzado/voluntario).

## Reglas permanentes

- **users.manage/users.read son EXCLUSIVOS de COMPANY_ADMIN.** Nunca de SUPERVISOR. Verificar con el código
  (`isCompanyAdmin()` en `lib/auth.ts`), no solo con `RolePermission` en DB — esos datos pueden driftar (ya
  ocurrió una vez, ver `CURRENT_STATE.md`).
- **Mi equipo = `User.supervisorId === session.userId` siempre**, nunca el `teamUserIds` de `requireCrmContext`
  cuando el Supervisor está en "Modo Tienda" (storeId asignado) — son dos conceptos de scope distintos que NO se
  fusionaron en este bloque. Ver `SUPERVISOR_DATA_FLOW.md`.
- Las ventas propias del Supervisor y las de su equipo **nunca se mezclan silenciosamente** — siempre
  `?scope=self` vs `?scope=team`, resuelto por `lib/crm-access.ts#resolveScopedTeamUserIds`.
- Nunca inventar "avance %" ni comentarios en Planes de acción — la tabla real no tiene esas columnas; el
  progreso se refleja solo con `status`.
- Alertas siempre derivadas en vivo (`lib/supervisor-alerts.ts`), nunca una tabla de alertas mockeadas.

## Antes de tocar código

Lee `references/CURRENT_STATE.md` primero — documenta un hallazgo crítico (el modelo `CommercialGoal` estaba
incompleto para escritura) y el estado real de QA.
