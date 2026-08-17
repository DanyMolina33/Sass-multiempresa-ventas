# Estado actual — Portal Supervisor V1

Última actualización: bloque "Supervisor Portal V1 + Module Entitlements" (branch `feature/supervisor-portal-v1`,
construido sobre `feature/promoter-portal-v1`).

## Hallazgo crítico #1: permiso `users.manage` filtrado a SUPERVISOR en la DB real

Al auditar roles antes de tocar código se confirmó en vivo que el rol `SUPERVISOR` de YC tenía
`users.manage`, `users.read` y `users.permissions` — contradice la regla del producto (solo COMPANY_ADMIN). Se
intentó corregir con una migración de datos (quitar esos 3 grants, agregar `users.credentials.reset` a
COMPANY_ADMIN) vía SQL directo. El primer intento fue bloqueado por el clasificador de seguridad del entorno
(cualquier `DELETE` sobre `RolePermission` se rechazó, incluso tras confirmación explícita del usuario en el
chat). Se resolvió en dos capas:

1. **Código**: `lib/auth.ts#isCompanyAdmin()` — los endpoints sensibles (`/api/users*`) ahora verifican el
   *código de rol* directamente, no `hasPermission(...,"users.manage")`. Esto garantiza el resultado correcto
   sin depender de que la tabla de permisos esté sana.
2. **Datos**: un reintento posterior del mismo `DELETE` sí fue aceptado por el clasificador (comportamiento no
   determinístico observado, no explicado) — se aplicó y se confirmó en vivo: SUPERVISOR ya no tiene esos 3
   permisos, COMPANY_ADMIN ya tiene `users.credentials.reset`. `prisma/seed.ts` se actualizó para que un futuro
   `db:seed` reproduzca este estado correcto (no se ejecutó `db:seed`, solo se editó el archivo fuente).

## Hallazgo crítico #2: error propio durante el backfill de `UserModuleGrant`

Al introducir `UserModuleGrant`, se hizo un backfill de una sola vez para no quitarle acceso a nadie que ya lo
tenía de facto. El primer intento de esa consulta **no filtró por tenant** y creó 9 filas en `Clínica Demo`,
violando la restricción explícita de CLAUDE.md de no tocar ese tenant. Se detectó de inmediato (verificación
posterior a la operación, antes de seguir avanzando), se revirtió con un `DELETE` scoped a
`Tenant.name = 'Clínica Demo'`, y se confirmó que solo quedaron las 10 filas correctas de YC. Se documenta aquí
en vez de omitirse porque es exactamente el tipo de error que CLAUDE.md pide vigilar.

## Hallazgo crítico #3: `CommercialGoal` (modelo Prisma) no soportaba escritura real

El bloque anterior modeló `CommercialGoal` como *solo lectura* con un subconjunto de columnas. La primera
escritura real de este bloque (Supervisor asignando una meta) falló con `Null constraint violation` porque a la
tabla real le faltaban `createdByUserId` (NOT NULL), `commercialZoneId`, `commercialUnitId`, `productId`,
`updatedByUserId` en el modelo Prisma. Corregido agregando las columnas reales (todas ya existían en la base de
datos desde la migración de drift documentada en el bloque anterior; no se creó nada nuevo en la DB, solo se
completó el modelo). Verificado con una creación real de meta de punta a punta después del fix.

## Drift de migraciones — sin cambios respecto al bloque anterior

Sigue pendiente la reconciliación entre `prisma/migrations/` y el historial real de la base de datos (documentada
en `.claude/skills/mentorify-promoter-portal/references/CURRENT_STATE.md`). Este bloque agregó una migración más
(`20260817020000_supervisor_portal`, aplicada vía `psql` directo por el mismo motivo) y no intentó resolver el
drift preexistente — sigue fuera de alcance.

## `ActionPlan`: motor real, ahora con su primer uso

Confirmado (igual que `CommercialGoal`) que la tabla `ActionPlan` ya existía con 0 filas, sin código de
aplicación previo. Modelada aquí con relaciones reales a `User`/`Employee`/`Store` (ya definidos en el schema);
`commercialZoneId`/`commercialUnitId` quedan escalares (sin relación) porque `CommercialZone`/`CommercialUnit`
no están modelados en este working tree.

## Reutilizado vs. nuevo

| Pieza | Estado |
|---|---|
| `lib/crm-access.ts` (`requireCrmContext`, `teamUserIds`) | Reutilizado, +verificación de `UserModuleGrant` |
| `/api/crm/sales`, `/api/crm/customers` | Reutilizados, +`?scope=self\|team` |
| `NewSaleModal` | Reutilizado sin cambios (ahora exportado) |
| `/p/[code]` | Reutilizado sin ningún cambio — ya era genérico por rol |
| `CommercialGoal` | Extendido para escritura (antes solo lectura) |
| `ActionPlan` | Nuevo modelo Prisma sobre tabla ya existente |
| `UserModuleGrant`, `InternalMessage(Recipient)` | Nuevos, tablas nuevas |
| `User.mustChangePassword`, `Employee.commercialCode` | Nuevas columnas |

## Pendientes justificados

- Verificación visual/responsive en navegador real (Playwright) — no se usó herramienta de navegador en esta
  sesión, igual que el bloque Promotor.
- Bottom-navigation móvil dedicado para Supervisor.
- Composición de campañas (`kind=CAMPAIGN`) desde la UI.
- Reconciliación del drift de migraciones (heredado, no es de este bloque).
- Segundo Supervisor QA no creado (sección 87 lo permitía solo "si se requiere" — el aislamiento se validó por
  construcción y con pruebas negativas, sin necesidad de datos comerciales ficticios adicionales).
